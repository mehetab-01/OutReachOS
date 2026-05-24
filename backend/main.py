import asyncio
import json as _json
import os
import random
from datetime import datetime, date, timedelta
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from ai import draft_lead, build_lanes, ParallelDispatcher, AVAILABLE_MODELS, PROVIDERS
from auth import get_current_user
from database import Base, engine, get_db
from email_sender import SmtpConfig
from email_sender import send_email
from models import Campaign, Draft, Lead, SendBatch, SendLog
from schemas import (
    CampaignCreate,
    CampaignOut,
    DraftOut,
    DraftPatch,
    LeadIn,
    LeadOut,
    SendBatchCreate,
    SendBatchOut,
    SendLogOut,
    SendStatsOut,
    SmtpConfig as SmtpConfigSchema,
)

load_dotenv()


def _resolve_smtp(cfg: "SmtpConfigSchema") -> "SmtpConfigSchema":
    """Fill any blank SMTP fields from .env so frontend credentials are optional."""
    from schemas import SmtpConfig as SmtpConfigSchema
    return SmtpConfigSchema(
        host=cfg.host or os.environ.get("SMTP_HOST", "smtp.gmail.com"),
        port=cfg.port or int(os.environ.get("SMTP_PORT", 587)),
        user=cfg.user or os.environ.get("SMTP_USER", ""),
        password=cfg.password or os.environ.get("SMTP_PASS", ""),
    )


Base.metadata.create_all(bind=engine)

# Safe migrations for columns added after initial deploy
from sqlalchemy import text, inspect as sa_inspect
with engine.connect() as conn:
    insp = sa_inspect(engine)

    draft_cols = [c["name"] for c in insp.get_columns("drafts")]
    if "model_used" not in draft_cols:
        conn.execute(text("ALTER TABLE drafts ADD COLUMN model_used TEXT"))
    if "batch_id" not in draft_cols:
        conn.execute(text("ALTER TABLE drafts ADD COLUMN batch_id INTEGER REFERENCES send_batches(id)"))

    # campaigns migrations
    camp_cols = [c["name"] for c in insp.get_columns("campaigns")]
    if "user_id" not in camp_cols:
        conn.execute(text("ALTER TABLE campaigns ADD COLUMN user_id TEXT NOT NULL DEFAULT ''"))

    # send_logs migrations
    if insp.has_table("send_logs"):
        log_cols = [c["name"] for c in insp.get_columns("send_logs")]
        if "batch_id" not in log_cols:
            conn.execute(text("ALTER TABLE send_logs ADD COLUMN batch_id INTEGER"))
        if "smtp_user" not in log_cols:
            conn.execute(text("ALTER TABLE send_logs ADD COLUMN smtp_user TEXT DEFAULT ''"))

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
def create_campaign(
    body: CampaignCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    campaign = Campaign(user_id=user["uid"], **body.model_dump())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


@app.get("/api/campaigns", response_model=List[CampaignOut])
def list_campaigns(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return (
        db.query(Campaign)
        .filter(Campaign.user_id == user["uid"])
        .order_by(Campaign.created_at.desc())
        .all()
    )


@app.get("/api/campaigns/{campaign_id}", response_model=CampaignOut)
def get_campaign(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user["uid"]
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


# ── Leads ──────────────────────────────────────────────────────────────────────

@app.post("/api/campaigns/{campaign_id}/leads", response_model=List[LeadOut])
def upload_leads(
    campaign_id: int,
    leads: List[LeadIn],
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user["uid"]
    ).first()
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
def get_leads(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user["uid"]
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
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
        db.flush()

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
        draft.error_msg = None
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

    # ── 4. DB callbacks ────────────────────────────────────────────────────────
    async def _save_result(lead_id: int, result: dict):
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

    async def _save_error(lead_id: int, err_str: str, _is_quota: bool):
        db2 = SessionLocal()
        try:
            lead = db2.query(Lead).filter(Lead.id == lead_id).first()
            if lead and lead.draft:
                lead.draft.status = "error"
                lead.draft.error_msg = err_str
                db2.commit()
        finally:
            db2.close()

    async def _mark_drafting(lead_id: int):
        db2 = SessionLocal()
        try:
            lead = db2.query(Lead).filter(Lead.id == lead_id).first()
            if lead and lead.draft and lead.draft.status not in ("approved", "sent", "drafted"):
                lead.draft.status = "drafting"
                lead.draft.error_msg = None
                db2.commit()
        finally:
            db2.close()

    # ── 5. Run dispatcher ─────────────────────────────────────────────────────
    from ai import _build_prompt
    dispatcher = ParallelDispatcher(lanes, _save_result, _save_error, stop_event)

    for lead_id, lead_dict, campaign_dict in pending:
        prompt = _build_prompt(lead_dict, campaign_dict)
        await _mark_drafting(lead_id)
        dispatcher.enqueue(lead_id, prompt)

    try:
        await dispatcher.run()
    finally:
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
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    x_ai_providers: Optional[str] = Header(default=None),
    x_gemini_key: Optional[str] = Header(default=None),
    x_gemini_keys: Optional[str] = Header(default=None),
    x_gemini_model: Optional[str] = Header(default=None),
):
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user["uid"]
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    providers_config = _parse_providers(x_ai_providers)
    legacy_keys = [k.strip() for k in x_gemini_keys.split(",")] if x_gemini_keys else []

    asyncio.create_task(
        _draft_all_task(campaign_id, providers_config, x_gemini_key, legacy_keys, x_gemini_model)
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

DAILY_CAP = 400          # hard stop per SMTP account per day
DRIP_MIN_S = 25          # min seconds between emails in a batch
DRIP_MAX_S = 90          # max seconds between emails in a batch
BATCH_COOLDOWN_MIN = 10  # recommended minutes between batches

# track active batch sends  batch_id → asyncio.Event (set = stop)
_sending_batches: dict = {}


def _sent_today(db: Session, smtp_user: str) -> int:
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(SendLog.id))
        .filter(SendLog.smtp_user == smtp_user, SendLog.sent_at >= today_start)
        .scalar() or 0
    )


def _sent_this_month(db: Session, smtp_user: str) -> int:
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(func.count(SendLog.id))
        .filter(SendLog.smtp_user == smtp_user, SendLog.sent_at >= month_start)
        .scalar() or 0
    )


def _sent_all_time(db: Session, smtp_user: str) -> int:
    return (
        db.query(func.count(SendLog.id))
        .filter(SendLog.smtp_user == smtp_user)
        .scalar() or 0
    )


# ── Stats ──────────────────────────────────────────────────────────────────────

@app.get("/api/campaigns/{campaign_id}/send-stats")
def get_send_stats(
    campaign_id: int,
    smtp_user: str = "",
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    smtp_user = smtp_user or os.environ.get("SMTP_USER", "")
    today = _sent_today(db, smtp_user)
    return {
        "today": today,
        "this_month": _sent_this_month(db, smtp_user),
        "all_time": _sent_all_time(db, smtp_user),
        "daily_cap": DAILY_CAP,
        "remaining_today": max(0, DAILY_CAP - today),
    }


# ── Batch management ───────────────────────────────────────────────────────────

@app.get("/api/campaigns/{campaign_id}/batches", response_model=List[SendBatchOut])
def list_batches(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return (
        db.query(SendBatch)
        .filter(SendBatch.campaign_id == campaign_id)
        .order_by(SendBatch.created_at.desc())
        .all()
    )


@app.post("/api/campaigns/{campaign_id}/batches")
def create_batches(
    campaign_id: int,
    body: SendBatchCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Split all approved leads into batches of batch_size. Returns created batches."""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user["uid"]
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    approved = (
        db.query(Lead)
        .join(Draft)
        .filter(Lead.campaign_id == campaign_id, Draft.status == "approved")
        .all()
    )
    if not approved:
        raise HTTPException(status_code=400, detail="No approved drafts to batch")

    # Count existing batches to continue labelling (A, B, C…)
    existing = db.query(SendBatch).filter(SendBatch.campaign_id == campaign_id).count()

    size = max(1, body.batch_size)
    chunks = [approved[i:i + size] for i in range(0, len(approved), size)]
    created = []
    for idx, chunk in enumerate(chunks):
        label_idx = existing + idx
        label = f"Batch {chr(65 + label_idx % 26)}"
        if label_idx >= 26:
            label += str(label_idx // 26)
        batch = SendBatch(
            campaign_id=campaign_id,
            label=label,
            status="pending",
            total=len(chunk),
            smtp_user="",
        )
        db.add(batch)
        db.flush()
        for lead in chunk:
            lead.draft.status = "batched"
            lead.draft.batch_id = batch.id
        created.append(batch)
    db.commit()
    for b in created:
        db.refresh(b)
    return {"batches": [SendBatchOut.model_validate(b) for b in created]}


@app.delete("/api/batches/{batch_id}")
def delete_batch(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(SendBatch).filter(SendBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.status == "sending":
        raise HTTPException(status_code=400, detail="Cannot delete a batch that is currently sending")
    # Revert draft statuses back to approved so leads can be re-batched
    for log in batch.send_logs:
        pass  # logs stay
    # Find drafts that were in this batch (no FK on draft, we use send_logs)
    db.delete(batch)
    db.commit()
    return {"message": "Batch deleted"}


# ── Drip send task ─────────────────────────────────────────────────────────────

async def _drip_send_task(batch_id: int, smtp_cfg: SmtpConfigSchema, sender_name: str, sender_email: str):
    from database import SessionLocal

    stop_event = _sending_batches.get(batch_id)
    smtp = SmtpConfig(host=smtp_cfg.host, port=smtp_cfg.port, user=smtp_cfg.user, password=smtp_cfg.password)

    db = SessionLocal()
    try:
        batch = db.query(SendBatch).filter(SendBatch.id == batch_id).first()
        if not batch:
            return

        batch.status = "sending"
        batch.started_at = datetime.utcnow()
        batch.smtp_user = smtp_cfg.user
        db.commit()

        # Fetch leads that belong to this batch and haven't been sent yet
        leads = (
            db.query(Lead)
            .join(Draft)
            .filter(Draft.batch_id == batch_id, Draft.status == "batched")
            .order_by(Lead.id)
            .all()
        )
        random.shuffle(leads)

        for i, lead in enumerate(leads):
            if stop_event and stop_event.is_set():
                batch.status = "paused"
                db.commit()
                break

            # Hard daily cap check
            if _sent_today(db, smtp_cfg.user) >= DAILY_CAP:
                batch.status = "paused"
                db.commit()
                break

            draft = lead.draft
            sent_ok = False

            for attempt in range(2):  # retry once on transient SMTP error
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
                    db.add(SendLog(
                        draft_id=draft.id,
                        lead_id=lead.id,
                        batch_id=batch_id,
                        smtp_response=response,
                        sent_at=datetime.utcnow(),
                        smtp_user=smtp_cfg.user,
                    ))
                    batch.sent_count += 1
                    db.commit()
                    sent_ok = True
                    break
                except Exception as e:
                    err = str(e)
                    if attempt == 0:
                        # Wait 10s then retry once
                        await asyncio.sleep(10)
                    else:
                        draft.status = "error"
                        draft.error_msg = err
                        batch.error_count += 1
                        db.commit()

            # Drip delay between emails (skip after last one)
            if sent_ok and i < len(leads) - 1:
                await asyncio.sleep(random.uniform(DRIP_MIN_S, DRIP_MAX_S))

        # Mark batch complete if still in sending state
        db.refresh(batch)
        if batch.status == "sending":
            batch.status = "sent"
            batch.finished_at = datetime.utcnow()
            db.commit()

    finally:
        _sending_batches.pop(batch_id, None)
        db.close()


@app.post("/api/batches/{batch_id}/send")
async def send_batch(
    batch_id: int,
    smtp_config: SmtpConfigSchema,
    db: Session = Depends(get_db),
):
    batch = db.query(SendBatch).filter(SendBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    if batch.status == "sending":
        raise HTTPException(status_code=400, detail="Batch is already sending")
    if batch.status == "sent":
        raise HTTPException(status_code=400, detail="Batch already sent")

    campaign = db.query(Campaign).filter(Campaign.id == batch.campaign_id).first()
    sender_name = campaign.sender_name
    sender_email = campaign.sender_email
    smtp_config = _resolve_smtp(smtp_config)

    stop_event = asyncio.Event()
    _sending_batches[batch_id] = stop_event

    asyncio.create_task(_drip_send_task(
        batch_id, smtp_config, sender_name, sender_email,
    ))
    return {"message": f"Drip sending batch {batch.label} ({batch.total} emails)"}


@app.post("/api/campaigns/{campaign_id}/batches/send-all")
async def send_all_batches(
    campaign_id: int,
    smtp_config: SmtpConfigSchema,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Start all pending/paused batches sequentially as a true async task."""
    campaign = db.query(Campaign).filter(
        Campaign.id == campaign_id, Campaign.user_id == user["uid"]
    ).first()
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    pending_batches = (
        db.query(SendBatch)
        .filter(SendBatch.campaign_id == campaign_id, SendBatch.status.in_(["pending", "paused"]))
        .order_by(SendBatch.created_at)
        .all()
    )
    if not pending_batches:
        raise HTTPException(status_code=400, detail="No pending batches to send")

    if any(b.id in _sending_batches for b in pending_batches):
        raise HTTPException(status_code=400, detail="A batch is already sending")

    # Capture plain values before DB session closes
    batch_ids = [b.id for b in pending_batches]
    sender_name = campaign.sender_name
    sender_email = campaign.sender_email
    smtp_config = _resolve_smtp(smtp_config)

    async def _send_all_sequentially():
        for i, bid in enumerate(batch_ids):
            stop_event = asyncio.Event()
            _sending_batches[bid] = stop_event
            await _drip_send_task(bid, smtp_config, sender_name, sender_email)
            # Wait full cooldown between batches — but not after the last one
            if i < len(batch_ids) - 1:
                await asyncio.sleep(BATCH_COOLDOWN_MIN * 60)

    asyncio.create_task(_send_all_sequentially())
    return {"message": f"Sending {len(batch_ids)} batches sequentially", "batch_ids": batch_ids}


@app.post("/api/batches/{batch_id}/stop")
def stop_batch(batch_id: int, db: Session = Depends(get_db)):
    event = _sending_batches.get(batch_id)
    if event:
        event.set()
    batch = db.query(SendBatch).filter(SendBatch.id == batch_id).first()
    if batch and batch.status == "sending":
        batch.status = "paused"
        db.commit()
    return {"message": "Batch stopped"}


@app.get("/api/batches/{batch_id}/status", response_model=SendBatchOut)
def batch_status(batch_id: int, db: Session = Depends(get_db)):
    batch = db.query(SendBatch).filter(SendBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


@app.get("/api/campaigns/{campaign_id}/sendlog")
def get_sendlog(
    campaign_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
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
            "batch_id": log.batch_id,
            "sent_at": log.sent_at.isoformat(),
            "smtp_response": log.smtp_response,
            "smtp_user": log.smtp_user or "",
            "lead_name": log.draft.lead.name,
            "lead_email": log.draft.lead.email,
            "subject": log.draft.subject,
        })
    return result
