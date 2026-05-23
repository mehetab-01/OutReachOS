import asyncio
import json as _json
import os
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from ai import draft_lead, build_lanes, ParallelDispatcher, AVAILABLE_MODELS, PROVIDERS
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

# Add model_used column if it doesn't exist (safe migration)
from sqlalchemy import text, inspect as sa_inspect
with engine.connect() as conn:
    cols = [c["name"] for c in sa_inspect(engine).get_columns("drafts")]
    if "model_used" not in cols:
        conn.execute(text("ALTER TABLE drafts ADD COLUMN model_used TEXT"))
        conn.commit()

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
        draft.model_used = f"{result.get('provider_used','')}/{result.get('model_used','')}"
        draft.status = "drafted"
    except Exception as e:
        draft.status = "error"
        draft.error_msg = str(e)

    db.commit()
    db.refresh(draft)
    return {"status": draft.status, "draft_id": draft.id, "model_used": draft.model_used}


# track running batch stop-events per campaign
_running_batches: dict = {}   # campaign_id → asyncio.Event (set = stop requested)


async def _draft_all_task(campaign_id: int, providers_config: Optional[list],
                          api_key: Optional[str], api_keys: list, model: Optional[str]):
    from database import SessionLocal

    stop_event = asyncio.Event()
    _running_batches[campaign_id] = stop_event

    # ── 1. Collect leads that need drafting ───────────────────────────────────
    db = SessionLocal()
    try:
        leads = db.query(Lead).filter(Lead.campaign_id == campaign_id).all()
        pending = [
            (lead.id, _lead_to_dict(lead), _campaign_to_dict(lead.campaign))
            for lead in leads
            if lead.draft is None or lead.draft.status in ("pending", "error")
        ]
    finally:
        db.close()

    if not pending:
        _running_batches.pop(campaign_id, None)
        return

    # ── 2. Mark all as queued immediately so UI updates ───────────────────────
    db_q = SessionLocal()
    try:
        from ai import _build_prompt
        for lead_id, _, _ in pending:
            lead = db_q.query(Lead).filter(Lead.id == lead_id).first()
            if not lead:
                continue
            if lead.draft:
                lead.draft.status = "queued"
                lead.draft.error_msg = None
            else:
                db_q.add(Draft(lead_id=lead_id, status="queued"))
        db_q.commit()
    finally:
        db_q.close()

    # ── 3. Build lanes (one per provider+model+key combo available) ───────────
    lanes = build_lanes(providers_config, api_key, api_keys, model)
    if not lanes:
        db_err = SessionLocal()
        try:
            for lead_id, _, _ in pending:
                lead = db_err.query(Lead).filter(Lead.id == lead_id).first()
                if lead and lead.draft:
                    lead.draft.status = "error"
                    lead.draft.error_msg = "No AI provider configured."
            db_err.commit()
        finally:
            db_err.close()
        _running_batches.pop(campaign_id, None)
        return

    # ── 4. Callbacks written to DB ─────────────────────────────────────────────
    async def on_result(lead_id: int, result: dict):
        db2 = SessionLocal()
        try:
            lead = db2.query(Lead).filter(Lead.id == lead_id).first()
            if not lead or not lead.draft:
                return
            if lead.draft.status in ("approved", "sent"):
                return
            lead.draft.research = result["research"]
            lead.draft.subject = result["subject"]
            lead.draft.body = result["body"]
            lead.draft.model_used = f"{result.get('provider_used','')}/{result.get('model_used','')}"
            lead.draft.status = "drafted"
            lead.draft.error_msg = None
            db2.commit()
        finally:
            db2.close()

    async def on_error(lead_id: int, err_str: str, is_quota: bool):
        db2 = SessionLocal()
        try:
            lead = db2.query(Lead).filter(Lead.id == lead_id).first()
            if lead and lead.draft:
                lead.draft.status = "error"
                lead.draft.error_msg = err_str
                db2.commit()
        finally:
            db2.close()

    # ── 5. Mark each lead as "drafting" when dispatcher picks it up ───────────
    # We patch on_result/on_error to also set status before calling AI.
    # Instead, use a pre-dispatch hook via a wrapper queue watcher.
    # Simpler: mark as "drafting" inside a thin wrapper around on_result.

    async def mark_drafting(lead_id: int):
        db2 = SessionLocal()
        try:
            lead = db2.query(Lead).filter(Lead.id == lead_id).first()
            if lead and lead.draft and lead.draft.status not in ("approved", "sent", "drafted"):
                lead.draft.status = "drafting"
                lead.draft.error_msg = None
                db2.commit()
        finally:
            db2.close()

    # Wrap the dispatcher's worker to mark drafting before calling AI
    original_worker = ParallelDispatcher._worker

    async def _worker_with_drafting(self_lane, lane):
        while not stop_event.is_set():
            while not lane.is_available():
                if stop_event.is_set():
                    return
                await asyncio.sleep(1)
            try:
                item = self_lane._queue.get_nowait()
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.1)
                continue

            lead_id, lead, campaign, prompt, retries = item
            await mark_drafting(lead_id)

            from ai import _CALLERS, _is_quota_error
            try:
                result = await lane.call(prompt)
                result["model_used"] = lane.model_id
                result["provider_used"] = lane.provider
                await self_lane.on_result(lead_id, result)
                self_lane._queue.task_done()
            except Exception as e:
                err_str = str(e)
                is_quota = _is_quota_error(err_str)
                if is_quota:
                    is_rpd = any(k in err_str.lower() for k in ("rpd", "daily", "day limit", "exhausted"))
                    if is_rpd:
                        lane.exhausted = True
                    else:
                        lane.freeze(60)
                    if retries < 3:
                        self_lane._queue.put_nowait((lead_id, lead, campaign, prompt, retries + 1))
                        self_lane._queue.task_done()
                    else:
                        await self_lane.on_error(lead_id, f"All lanes quota-exhausted: {err_str[:300]}", True)
                        self_lane._queue.task_done()
                else:
                    if retries < 2:
                        await asyncio.sleep(2)
                        self_lane._queue.put_nowait((lead_id, lead, campaign, prompt, retries + 1))
                        self_lane._queue.task_done()
                    else:
                        await self_lane.on_error(lead_id, err_str[:400], False)
                        self_lane._queue.task_done()

    # ── 6. Run dispatcher ─────────────────────────────────────────────────────
    from ai import _build_prompt
    dispatcher = ParallelDispatcher(lanes, on_result, on_error, stop_event)

    # Override _worker with our drafting-aware version
    ParallelDispatcher._worker = _worker_with_drafting

    for lead_id, lead_dict, campaign_dict in pending:
        prompt = _build_prompt(lead_dict, campaign_dict)
        dispatcher.enqueue(lead_id, lead_dict, campaign_dict, prompt)

    try:
        await dispatcher.run()
    finally:
        ParallelDispatcher._worker = original_worker
        _running_batches.pop(campaign_id, None)


@app.post("/api/campaigns/{campaign_id}/draft-all/stop")
def stop_draft_all(campaign_id: int):
    event = _running_batches.get(campaign_id)
    if event:
        event.set()
    return {"message": "Batch stopped"}


@app.get("/api/campaigns/{campaign_id}/draft-all/status")
def draft_all_status(campaign_id: int, db: Session = Depends(get_db)):
    leads = db.query(Lead).filter(Lead.campaign_id == campaign_id).all()
    total = len(leads)
    counts = {"pending": 0, "queued": 0, "drafting": 0, "drafted": 0, "error": 0, "approved": 0, "sent": 0, "skipped": 0}
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
