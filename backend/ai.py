import asyncio
import json
import os
import re
from typing import Optional
import google.generativeai as genai


SYSTEM_PROMPT = "You are a cold email copywriter for a premium web development studio. You write concise, personalized, non-generic cold emails that feel human."


def _build_prompt(lead: dict, campaign: dict) -> str:
    return f"""STUDIO: Arcen Studio — Mumbai, India
WHAT WE DO: {campaign['pitch']}
SERVICES: {campaign['services']}
TONE: {campaign['tone']}
CTA: We want {campaign['cta']}

LEAD:
- Business Name: {lead['name']}
- Category: {lead['category'].replace('_', ' ').title()}
- City: {lead['city']}
- Phone: {lead.get('phone') or 'N/A'}
- Google Review Score: {lead.get('review_score') or 'N/A'}
- Facebook: {lead.get('facebook_url') or 'None found'}
- Has Website: NO (scraped from Google Maps "no website" filter)

YOUR TASK:
1. Write a SHORT research summary (2-3 sentences) about what this type of business typically lacks online and where their competitors are ahead.
2. Write a cold email:
   - Subject line using the business name naturally
   - Opening that shows you know their specific business type
   - 1-2 sentences on what they're missing vs competitors
   - Brief mention of what we offer (no features list)
   - Clear CTA: {campaign['cta']}
   - Sign off from {campaign['sender_name']} at Arcen Studio
   - Under 150 words total body
   - Must NOT sound like a mass email

Respond ONLY in this exact JSON format with no markdown, no backticks, no extra text:
{{"research":"...","subject":"...","body":"..."}}"""


async def draft_lead(lead: dict, campaign: dict, api_key: Optional[str] = None) -> dict:
    key = api_key or os.getenv("GEMINI_API_KEY")
    if not key:
        raise ValueError("No Gemini API key available. Set GEMINI_API_KEY in .env or provide via X-Gemini-Key header.")

    genai.configure(api_key=key)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    prompt = _build_prompt(lead, campaign)
    last_error = None

    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={"temperature": 0.7, "max_output_tokens": 1024},
            )
            raw = response.text.strip()
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)
            parsed = json.loads(raw)
            if not all(k in parsed for k in ("research", "subject", "body")):
                raise ValueError(f"Missing keys in response: {list(parsed.keys())}")
            return parsed
        except Exception as e:
            last_error = e
            if attempt < 2:
                await asyncio.sleep(2 ** attempt * 2)

    raise RuntimeError(f"Gemini draft failed after 3 attempts: {last_error}")
