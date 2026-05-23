from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class CampaignCreate(BaseModel):
    name: str
    pitch: str
    services: str
    cta: str
    tone: str = "Conversational"
    sender_name: str
    sender_email: str


class CampaignOut(BaseModel):
    id: int
    name: str
    pitch: str
    services: str
    cta: str
    tone: str
    sender_name: str
    sender_email: str
    created_at: datetime

    class Config:
        from_attributes = True


class LeadIn(BaseModel):
    name: str
    email: str
    city: str = ""
    category: str = ""
    phone: str = ""
    facebook_url: str = ""
    review_score: Optional[float] = None


class DraftOut(BaseModel):
    id: int
    lead_id: int
    research: str
    subject: str
    body: str
    status: str
    model_used: Optional[str]
    error_msg: Optional[str]
    sent_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class LeadOut(BaseModel):
    id: int
    campaign_id: int
    name: str
    email: str
    city: str
    category: str
    phone: str
    facebook_url: str
    review_score: Optional[float]
    draft: Optional[DraftOut]

    class Config:
        from_attributes = True


class DraftPatch(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None


class SmtpConfig(BaseModel):
    host: str
    port: int
    user: str
    password: str


class SendBatchCreate(BaseModel):
    batch_size: int = 20


class SendBatchOut(BaseModel):
    id: int
    campaign_id: int
    label: str
    status: str
    total: int
    sent_count: int
    error_count: int
    smtp_user: str
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


class SendLogOut(BaseModel):
    id: int
    draft_id: int
    lead_id: int
    batch_id: Optional[int]
    sent_at: datetime
    smtp_response: str
    smtp_user: str
    lead_name: str
    lead_email: str
    subject: str

    class Config:
        from_attributes = True


class SendStatsOut(BaseModel):
    today: int
    this_month: int
    all_time: int
    daily_cap: int
    remaining_today: int
