import asyncio
import os
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from ai import draft_lead, AVAILABLE_MODELS
from database import Base, engine, get_db
from email_sender import SmtpConfig
from email_sender import send_email
from models import Campaign, Draft, Lead, SendLog
from schemas import (
    CampaignCreate,
    CampaignOut,
    DraftOut,
    DraftPatch,
    LeadIn,
    LeadOut,
    SmtpConfig as SmtpConfigSchema,
)

load_dotenv()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="OutreachOS API", version="1.0.0")


@app.get("/api/models")
def list_models():
    return AVAILABLE_MODELS

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _campaign_to_dict(campaign: Campaign) -> dict:
    return {
        "pitch": campaign.pitch,
        "services": campaign.services,
        "cta": campaign.cta,
        "tone": campaign.tone,
        "sender_name": campaign.sender_name,
        "sender_email": campaign.sender_email,
    }


def _lead_to_dict(lead: Lead) -> dict:
    return {
        "name": lead.name,
        "email": lead.email,
        "city": lead.city,
        "category": lead.category,
        "phone": lead.phone,
        "facebook_url": lead.facebook_url,
        "review_score": lead.review_score,
    }


# ── Campaigns ──────────────────────────────────────────────────────────────

@app.post("/api/campaigns", response_model=CampaignOut)
def create_campaign(body: CampaignCreate, db: Session = Depends(get_db)):
    campaign = Campaign(**body.model_dump())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@app.get("/api/campaigns", response_model=List[CampaignOut])
def list_campaigns(db: Session = Depends(get_db)):
    return db.query(Campaign).order_by(Campaign.created_at.desc()).all()


@app.get("/api/campaigns/{campaign_id}", response_model=CampaignOut)
def get_campaign(campaign_id: int, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


# ── Leads ──────────────────────────────────────────────────────────────────

@app.post("/api/campaigns/{campaign_id}/leads", response_model=List[LeadOut])
def upload_leads(campaign_id: int, leads: List[LeadIn], db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    created = []
    for lead_data in leads:
        lead = Lead(campaign_id=campaign_id, **lead_data.model_dump())
        db.add(lead)
        db.flush()
        draft = Draft(lead_id=lead.id, status="pending")
        db.add(draft)
        created.append(lead)

    db.commit()
    for lead in created:
        db.refresh(lead)
    return created


@app.get("/api/campaigns/{campaign_id}/leads", response_model=List[LeadOut])
def get_leads(campaign_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Lead)
        .filter(Lead.campaign_id == campaign_id)
        .order_by(Lead.id)
        .all()
    )


# ── Drafts ─────────────────────────────────────────────────────────────────

@app.post("/api/leads/{lead_id}/draft")
async def draft_single(
    lead_id: int,
    db: Session = Depends(get_db),
    x_gemini_key: Optional[str] = Header(default=None),
    x_gemini_keys: Optional[str] = Header(default=None),
    x_gemini_model: Optional[str] = Header(default=None),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    draft = lead.draft
    if not draft:
        draft = Draft(lead_id=lead.id, status="pending")
        db.add(draft)
        db.commit()
        db.refresh(draft)

    draft.status = "drafting"
    db.commit()

    keys_pool = [k.strip() for k in x_gemini_keys.split(",")] if x_gemini_keys else []

    try:
        result = await draft_lead(
            _lead_to_dict(lead),
            _campaign_to_dict(lead.campaign),
            api_key=x_gemini_key,
            api_keys=keys_pool,
            model=x_gemini_model,
        )
        draft.research = result["research"]
        draft.subject = result["subject"]
        draft.body = result["body"]
        draft.status = "drafted"
    except Exception as e:
        draft.status = "error"
        draft.error_msg = str(e)

    db.commit()
    db.refresh(draft)
    return {"status": draft.status, "draft_id": draft.id}


async def _draft_all_task(campaign_id: int, api_key: Optional[str], api_keys: list, model: Optional[str]):
    from database import SessionLocal

    db = SessionLocal()
    try:
        leads = db.query(Lead).filter(Lead.campaign_id == campaign_id).all()
        for lead in leads:
            draft = lead.draft
            if not draft:
                draft = Draft(lead_id=lead.id, status="pending")
                db.add(draft)
                db.commit()
                db.refresh(draft)

            if draft.status in ("approved", "sent", "drafting"):
                continue

            draft.status = "drafting"
            db.commit()

            try:
                result = await draft_lead(
                    _lead_to_dict(lead),
                    _campaign_to_dict(lead.campaign),
                    api_key=api_key,
                    api_keys=api_keys,
                    model=model,
                )
                draft.research = result["research"]
                draft.subject = result["subject"]
                draft.body = result["body"]
                draft.status = "drafted"
            except Exception as e:
                draft.status = "error"
                draft.error_msg = str(e)

            db.commit()
            await asyncio.sleep(1.2)
    finally:
        db.close()


@app.post("/api/campaigns/{campaign_id}/draft-all")
async def draft_all(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_gemini_key: Optional[str] = Header(default=None),
    x_gemini_keys: Optional[str] = Header(default=None),
    x_gemini_model: Optional[str] = Header(default=None),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    keys_pool = [k.strip() for k in x_gemini_keys.split(",")] if x_gemini_keys else []
    background_tasks.add_task(_draft_all_task, campaign_id, x_gemini_key, keys_pool, x_gemini_model)
    return {"message": "Batch draft started"}


@app.patch("/api/drafts/{draft_id}", response_model=DraftOut)
def patch_draft(draft_id: int, body: DraftPatch, db: Session = Depends(get_db)):
    draft = db.query(Draft).filter(Draft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    if body.subject is not None:
        draft.subject = body.subject
    if body.body is not None:
        draft.body = body.body
    if body.status is not None:
        draft.status = body.status

    db.commit()
    db.refresh(draft)
    return draft


# ── Send ───────────────────────────────────────────────────────────────────

@app.post("/api/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: int,
    smtp_config: SmtpConfigSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    approved_leads = (
        db.query(Lead)
        .join(Draft)
        .filter(Lead.campaign_id == campaign_id, Draft.status == "approved")
        .all()
    )

    if not approved_leads:
        raise HTTPException(status_code=400, detail="No approved drafts to send")

    background_tasks.add_task(
        _send_all_task,
        campaign_id,
        smtp_config,
        campaign.sender_name,
        campaign.sender_email,
    )
    return {"message": f"Sending {len(approved_leads)} emails in background"}


async def _send_all_task(
    campaign_id: int,
    smtp_config: SmtpConfigSchema,
    sender_name: str,
    sender_email: str,
):
    from database import SessionLocal

    db = SessionLocal()
    smtp = SmtpConfig(
        host=smtp_config.host,
        port=smtp_config.port,
        user=smtp_config.user,
        password=smtp_config.password,
    )
    try:
        leads = (
            db.query(Lead)
            .join(Draft)
            .filter(Lead.campaign_id == campaign_id, Draft.status == "approved")
            .all()
        )
        for lead in leads:
            draft = lead.draft
            try:
                response = await send_email(
                    smtp=smtp,
                    to_email=lead.email,
                    to_name=lead.name,
                    from_name=sender_name,
                    from_email=sender_email,
                    subject=draft.subject,
                    body=draft.body,
                )
                draft.status = "sent"
                draft.sent_at = datetime.utcnow()
                log = SendLog(
                    draft_id=draft.id,
                    lead_id=lead.id,
                    smtp_response=response,
                    sent_at=datetime.utcnow(),
                )
                db.add(log)
                db.commit()
            except Exception as e:
                draft.status = "error"
                draft.error_msg = str(e)
                db.commit()
    finally:
        db.close()


@app.get("/api/campaigns/{campaign_id}/sendlog")
def get_sendlog(campaign_id: int, db: Session = Depends(get_db)):
    logs = (
        db.query(SendLog)
        .join(Lead)
        .filter(Lead.campaign_id == campaign_id)
        .order_by(SendLog.sent_at.desc())
        .all()
    )
    result = []
    for log in logs:
        result.append({
            "id": log.id,
            "draft_id": log.draft_id,
            "lead_id": log.lead_id,
            "sent_at": log.sent_at.isoformat(),
            "smtp_response": log.smtp_response,
            "lead_name": log.draft.lead.name,
            "lead_email": log.draft.lead.email,
            "subject": log.draft.subject,
        })
    return result
