import asyncio
import json
import os
import re
from typing import Optional
from google import genai
from google.genai import types

SYSTEM_PROMPT = "You are a cold email copywriter for a premium web development studio. You write concise, personalized, non-generic cold emails that feel human."

AVAILABLE_MODELS = [
    {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash (Fastest)"},
    {"id": "gemini-2.0-flash-lite", "label": "Gemini 2.0 Flash Lite (Cheapest)"},
    {"id": "gemini-1.5-flash", "label": "Gemini 1.5 Flash"},
    {"id": "gemini-1.5-flash-8b", "label": "Gemini 1.5 Flash 8B"},
    {"id": "gemini-1.5-pro", "label": "Gemini 1.5 Pro (Best Quality)"},
    {"id": "gemini-2.5-flash-preview-05-20", "label": "Gemini 2.5 Flash Preview"},
]

DEFAULT_MODEL = "gemini-2.0-flash"


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


def _pick_key(api_keys: Optional[list], env_key: Optional[str]) -> str:
    """Round-robin through provided keys, fall back to env."""
    keys = [k for k in (api_keys or []) if k and k.strip()]
    if not keys and env_key:
        keys = [env_key]
    if not keys:
        raise ValueError(
            "No Gemini API key available. Set GEMINI_API_KEY in .env or provide via X-Gemini-Key header."
        )
    # use a module-level counter for simple rotation
    idx = _pick_key._counter % len(keys)
    _pick_key._counter += 1
    return keys[idx].strip()

_pick_key._counter = 0


async def draft_lead(
    lead: dict,
    campaign: dict,
    api_key: Optional[str] = None,
    api_keys: Optional[list] = None,
    model: Optional[str] = None,
) -> dict:
    # api_key = single key (legacy header), api_keys = pool from new header
    all_keys = list(api_keys or [])
    if api_key and api_key not in all_keys:
        all_keys.insert(0, api_key)

    key = _pick_key(all_keys or None, os.getenv("GEMINI_API_KEY"))
    chosen_model = model or DEFAULT_MODEL

    client = genai.Client(api_key=key)
    prompt = _build_prompt(lead, campaign)
    last_error = None

    for attempt in range(3):
        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=chosen_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    temperature=0.7,
                    max_output_tokens=1024,
                ),
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
