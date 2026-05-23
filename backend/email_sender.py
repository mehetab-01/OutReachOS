import asyncio
import random
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dataclasses import dataclass


@dataclass
class SmtpConfig:
    host: str
    port: int
    user: str
    password: str


async def send_email(
    smtp: SmtpConfig,
    to_email: str,
    to_name: str,
    from_name: str,
    from_email: str,
    subject: str,
    body: str,
) -> str:
    """Send a single email via STARTTLS. Returns SMTP response string."""
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg["Reply-To"] = from_email

    plain = MIMEText(body, "plain")
    html_body = body.replace("\n", "<br>")
    html = MIMEText(
        f"<html><body style='font-family:sans-serif;max-width:600px'>{html_body}</body></html>",
        "html",
    )
    msg.attach(plain)
    msg.attach(html)

    def _send():
        with smtplib.SMTP(smtp.host, smtp.port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp.user, smtp.password)
            server.sendmail(from_email, [to_email], msg.as_string())
            return "250 OK"

    response = await asyncio.to_thread(_send)

    delay = random.uniform(3, 8)
    await asyncio.sleep(delay)

    return response
