from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    pitch = Column(Text, nullable=False)
    services = Column(Text, nullable=False)
    cta = Column(Text, nullable=False)
    tone = Column(String, default="Conversational")
    sender_name = Column(String, nullable=False)
    sender_email = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    leads = relationship("Lead", back_populates="campaign", cascade="all, delete-orphan")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    city = Column(String, default="")
    category = Column(String, default="")
    phone = Column(String, default="")
    facebook_url = Column(String, default="")
    review_score = Column(Float, nullable=True)

    campaign = relationship("Campaign", back_populates="leads")
    draft = relationship("Draft", back_populates="lead", uselist=False, cascade="all, delete-orphan")


class Draft(Base):
    __tablename__ = "drafts"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), unique=True, nullable=False)
    research = Column(Text, default="")
    subject = Column(String, default="")
    body = Column(Text, default="")
    status = Column(String, default="pending")
    model_used = Column(String, nullable=True)
    error_msg = Column(Text, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="draft")
    send_logs = relationship("SendLog", back_populates="draft", cascade="all, delete-orphan")


class SendLog(Base):
    __tablename__ = "send_logs"

    id = Column(Integer, primary_key=True, index=True)
    draft_id = Column(Integer, ForeignKey("drafts.id"), nullable=False)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    sent_at = Column(DateTime, default=datetime.utcnow)
    smtp_response = Column(Text, default="")

    draft = relationship("Draft", back_populates="send_logs")
