import asyncio
import json as _json
import os
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from ai import draft_lead, AVAILABLE_MODELS, PROVIDERS
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _parse_providers(header: Optional[str]) -> Optional[list]:
    """Parse X-AI-Providers JSON header into providers_config list."""
    if not header:
        return None
    try:
        data = _json.loads(header)
        if isinstance(data, list) and len(data) > 0:
            return data
    except Exception:
        pass
    return None


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


# ── Models ─────────────────────────────────────────────────────────────────────

@app.get("/api/models")
def list_models():
    return {"providers": PROVIDERS, "flat": AVAILABLE_MODELS}


# ── Campaigns ──────────────────────────────────────────────────────────────────

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


# ── Leads ──────────────────────────────────────────────────────────────────────

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


# ── Drafts ─────────────────────────────────────────────────────────────────────

@app.post("/api/leads/{lead_id}/draft")
async def draft_single(
    lead_id: int,
    db: Session = Depends(get_db),
    x_ai_providers: Optional[str] = Header(default=None),
    # legacy headers kept for compatibility
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
    draft.error_msg = None
    db.commit()

    providers_config = _parse_providers(x_ai_providers)
    legacy_keys = [k.strip() for k in x_gemini_keys.split(",")] if x_gemini_keys else []

    try:
        result = await draft_lead(
            _lead_to_dict(lead),
            _campaign_to_dict(lead.campaign),
            providers_config=providers_config,
            api_key=x_gemini_key,
            api_keys=legacy_keys,
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


RATE_LIMIT_DELAY = 15   # seconds to wait after a 429 before retrying same lead
BETWEEN_CALLS_DELAY = 2  # seconds between successful calls
MAX_RATE_LIMIT_RETRIES = 4  # how many times to back off per lead before marking error

# track running batch per campaign so we can stop it
_running_batches: dict = {}


async def _draft_all_task(campaign_id: int, providers_config: Optional[list],
                          api_key: Optional[str], api_keys: list, model: Optional[str]):
    from database import SessionLocal

    _running_batches[campaign_id] = True
    db = SessionLocal()
    try:
        leads = db.query(Lead).filter(Lead.campaign_id == campaign_id).all()
        pending_ids = [
            lead.id for lead in leads
            if (lead.draft is None or lead.draft.status not in ("approved", "sent", "drafted"))
        ]

        queue = list(pending_ids)
        rate_limit_hits: dict = {}  # lead_id → retry count

        while queue and _running_batches.get(campaign_id):
            lead_id = queue.pop(0)

            db2 = SessionLocal()
            try:
                lead = db2.query(Lead).filter(Lead.id == lead_id).first()
                if not lead:
                    continue

                draft = lead.draft
                if not draft:
                    draft = Draft(lead_id=lead.id, status="pending")
                    db2.add(draft)
                    db2.commit()
                    db2.refresh(draft)

                # already done by a single-draft click
                if draft.status in ("approved", "sent", "drafted"):
                    continue

                draft.status = "drafting"
                draft.error_msg = None
                db2.commit()

                try:
                    result = await draft_lead(
                        _lead_to_dict(lead),
                        _campaign_to_dict(lead.campaign),
                        providers_config=providers_config,
                        api_key=api_key,
                        api_keys=api_keys,
                        model=model,
                    )
                    draft.research = result["research"]
                    draft.subject = result["subject"]
                    draft.body = result["body"]
                    draft.status = "drafted"
                    db2.commit()
                    rate_limit_hits.pop(lead_id, None)
                    await asyncio.sleep(BETWEEN_CALLS_DELAY)

                except Exception as e:
                    err_str = str(e)
                    is_rate_limit = (
                        "429" in err_str
                        or "RESOURCE_EXHAUSTED" in err_str
                        or "quota" in err_str.lower()
                        or "rate" in err_str.lower()
                    )

                    if is_rate_limit:
                        retries = rate_limit_hits.get(lead_id, 0)
                        if retries < MAX_RATE_LIMIT_RETRIES:
                            # put back at front of queue and wait
                            rate_limit_hits[lead_id] = retries + 1
                            queue.insert(0, lead_id)
                            draft.status = "pending"
                            draft.error_msg = None
                            db2.commit()
                            backoff = RATE_LIMIT_DELAY * (retries + 1)
                            await asyncio.sleep(backoff)
                        else:
                            draft.status = "error"
                            draft.error_msg = f"Rate limit hit {MAX_RATE_LIMIT_RETRIES}x — try adding more API keys in Configure. Original: {err_str[:200]}"
                            db2.commit()
                    else:
                        draft.status = "error"
                        draft.error_msg = err_str
                        db2.commit()
            finally:
                db2.close()

    finally:
        _running_batches.pop(campaign_id, None)
        db.close()


@app.post("/api/campaigns/{campaign_id}/draft-all/stop")
def stop_draft_all(campaign_id: int):
    _running_batches.pop(campaign_id, None)
    return {"message": "Batch stopped"}


@app.get("/api/campaigns/{campaign_id}/draft-all/status")
def draft_all_status(campaign_id: int, db: Session = Depends(get_db)):
    leads = db.query(Lead).filter(Lead.campaign_id == campaign_id).all()
    total = len(leads)
    counts = {"pending": 0, "drafting": 0, "drafted": 0, "error": 0, "approved": 0, "sent": 0, "skipped": 0}
    for lead in leads:
        s = lead.draft.status if lead.draft else "pending"
        counts[s] = counts.get(s, 0) + 1
    return {
        "running": campaign_id in _running_batches,
        "total": total,
        "counts": counts,
        "done": counts.get("drafted", 0) + counts.get("approved", 0) + counts.get("sent", 0),
    }


@app.post("/api/campaigns/{campaign_id}/draft-all")
async def draft_all(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    x_ai_providers: Optional[str] = Header(default=None),
    x_gemini_key: Optional[str] = Header(default=None),
    x_gemini_keys: Optional[str] = Header(default=None),
    x_gemini_model: Optional[str] = Header(default=None),
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    providers_config = _parse_providers(x_ai_providers)
    legacy_keys = [k.strip() for k in x_gemini_keys.split(",")] if x_gemini_keys else []

    background_tasks.add_task(
        _draft_all_task, campaign_id, providers_config, x_gemini_key, legacy_keys, x_gemini_model
    )
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


# ── Send ───────────────────────────────────────────────────────────────────────

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
