import asyncio
import json
import os
import re
from typing import Optional

SYSTEM_PROMPT = (
    "You are a cold email copywriter for a premium web development studio. "
    "You write concise, personalized, non-generic cold emails that feel human."
)

# ── Provider + model catalogue ────────────────────────────────────────────────

PROVIDERS = {
    "gemini": {
        "label": "Google Gemini",
        "models": [
            {"id": "gemini-2.0-flash",                  "label": "Gemini 2.0 Flash",         "note": "Fastest"},
            {"id": "gemini-2.0-flash-lite",              "label": "Gemini 2.0 Flash Lite",    "note": "Cheapest"},
            {"id": "gemini-2.5-flash-preview-05-20",    "label": "Gemini 2.5 Flash Preview", "note": "Latest"},
            {"id": "gemini-1.5-flash",                  "label": "Gemini 1.5 Flash",         "note": ""},
            {"id": "gemini-1.5-flash-8b",               "label": "Gemini 1.5 Flash 8B",      "note": "Lightweight"},
            {"id": "gemini-1.5-pro",                    "label": "Gemini 1.5 Pro",           "note": "Best quality"},
        ],
    },
    "claude": {
        "label": "Anthropic Claude",
        "models": [
            {"id": "claude-haiku-4-5-20251001",  "label": "Claude Haiku 4.5",  "note": "Fastest / cheapest"},
            {"id": "claude-sonnet-4-6",          "label": "Claude Sonnet 4.6", "note": "Recommended"},
            {"id": "claude-opus-4-7",            "label": "Claude Opus 4.7",   "note": "Most capable"},
        ],
    },
    "groq": {
        "label": "Groq (Ultra-fast)",
        "models": [
            {"id": "llama-3.3-70b-versatile",    "label": "Llama 3.3 70B",     "note": "Best on Groq"},
            {"id": "llama-3.1-8b-instant",       "label": "Llama 3.1 8B",      "note": "Fastest"},
            {"id": "mixtral-8x7b-32768",         "label": "Mixtral 8x7B",      "note": ""},
            {"id": "gemma2-9b-it",               "label": "Gemma 2 9B",        "note": ""},
        ],
    },
    "openrouter": {
        "label": "OpenRouter (Free tier)",
        "models": [
            {"id": "mistralai/mistral-7b-instruct:free",         "label": "Mistral 7B",          "note": "Free"},
            {"id": "meta-llama/llama-3.2-3b-instruct:free",     "label": "Llama 3.2 3B",        "note": "Free"},
            {"id": "google/gemma-3-4b-it:free",                 "label": "Gemma 3 4B",          "note": "Free"},
            {"id": "microsoft/phi-3-mini-128k-instruct:free",   "label": "Phi-3 Mini",          "note": "Free"},
            {"id": "qwen/qwen3-8b:free",                        "label": "Qwen3 8B",            "note": "Free"},
        ],
    },
}

# Flat list for the /api/models endpoint
AVAILABLE_MODELS = [
    {
        "provider": provider_id,
        "provider_label": meta["label"],
        "id": m["id"],
        "label": m["label"],
        "note": m["note"],
    }
    for provider_id, meta in PROVIDERS.items()
    for m in meta["models"]
]


def _detect_provider(model_id: str) -> str:
    if model_id.startswith("gemini"):
        return "gemini"
    if model_id.startswith("claude"):
        return "claude"
    if "/" in model_id:
        return "openrouter"
    return "groq"


# ── Prompt builder ─────────────────────────────────────────────────────────────

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


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    parsed = json.loads(raw)
    if not all(k in parsed for k in ("research", "subject", "body")):
        raise ValueError(f"Missing keys in response: {list(parsed.keys())}")
    return parsed


# ── Provider call implementations ─────────────────────────────────────────────

async def _call_gemini(model_id: str, api_key: str, prompt: str) -> dict:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model_id,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.7,
            max_output_tokens=1024,
        ),
    )
    return _parse_json(response.text)


async def _call_claude(model_id: str, api_key: str, prompt: str) -> dict:
    import anthropic

    client = anthropic.AsyncAnthropic(api_key=api_key)
    message = await client.messages.create(
        model=model_id,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    return _parse_json(message.content[0].text)


async def _call_groq(model_id: str, api_key: str, prompt: str) -> dict:
    from groq import AsyncGroq

    client = AsyncGroq(api_key=api_key)
    completion = await client.chat.completions.create(
        model=model_id,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=1024,
    )
    return _parse_json(completion.choices[0].message.content)


async def _call_openrouter(model_id: str, api_key: str, prompt: str) -> dict:
    import httpx

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://outreachos.arcenstudio.com",
                "X-Title": "OutreachOS",
            },
            json={
                "model": model_id,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
                "max_tokens": 1024,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        return _parse_json(data["choices"][0]["message"]["content"])


_PROVIDER_DISPATCH = {
    "gemini": _call_gemini,
    "claude": _call_claude,
    "groq": _call_groq,
    "openrouter": _call_openrouter,
}


# ── Priority queue ─────────────────────────────────────────────────────────────
# providers_config = list of {"provider": "gemini", "model": "gemini-2.0-flash", "key": "AIza..."}
# ordered by priority (index 0 = highest). We rotate keys within same provider.

_key_counters: dict = {}


def _pick_entry(providers_config: list) -> Optional[dict]:
    """Pick the next entry from priority list, round-robin within same provider+model."""
    if not providers_config:
        return None
    # group consecutive same provider+model into one pool, pick round-robin
    entry = providers_config[0]
    pool_key = f"{entry['provider']}:{entry['model']}"
    if pool_key not in _key_counters:
        _key_counters[pool_key] = 0
    idx = _key_counters[pool_key] % len(providers_config)
    _key_counters[pool_key] += 1
    return providers_config[idx]


# ── Main entry point ───────────────────────────────────────────────────────────

async def draft_lead(
    lead: dict,
    campaign: dict,
    providers_config: Optional[list] = None,
    # legacy single-key support
    api_key: Optional[str] = None,
    api_keys: Optional[list] = None,
    model: Optional[str] = None,
) -> dict:
    """
    providers_config: priority-ordered list of
      {"provider": "gemini"|"claude"|"groq"|"openrouter",
       "model": "<model_id>",
       "key": "<api_key>"}
    Falls back to legacy api_key/model for backwards compat.
    Falls back to env vars if nothing provided.
    """
    # Build providers list from new config or fall back to legacy
    if not providers_config:
        providers_config = _build_legacy_config(api_key, api_keys, model)

    if not providers_config:
        raise ValueError(
            "No AI provider configured. Add at least one API key in Configure → AI Configuration."
        )

    prompt = _build_prompt(lead, campaign)
    errors = []

    # Try each provider in priority order
    for entry in providers_config:
        provider = entry.get("provider", "gemini")
        model_id = entry.get("model", "gemini-2.0-flash")
        key = entry.get("key", "")

        # Fall back to env vars if key blank
        if not key:
            key = _env_key_for(provider)
        if not key:
            continue

        call_fn = _PROVIDER_DISPATCH.get(provider)
        if not call_fn:
            continue

        last_err = None
        for attempt in range(3):
            try:
                return await call_fn(model_id, key, prompt)
            except Exception as e:
                last_err = e
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt * 2)

        errors.append(f"{provider}/{model_id}: {last_err}")

    raise RuntimeError(
        f"All providers failed after retries. Errors: {'; '.join(str(e) for e in errors)}"
    )


def _env_key_for(provider: str) -> Optional[str]:
    mapping = {
        "gemini": "GEMINI_API_KEY",
        "claude": "ANTHROPIC_API_KEY",
        "groq": "GROQ_API_KEY",
        "openrouter": "OPENROUTER_API_KEY",
    }
    return os.getenv(mapping.get(provider, ""))


def _build_legacy_config(
    api_key: Optional[str],
    api_keys: Optional[list],
    model: Optional[str],
) -> list:
    """Convert old single-key / key-pool params into providers_config format."""
    model_id = model or "gemini-2.0-flash"
    provider = _detect_provider(model_id)

    keys = list(api_keys or [])
    if api_key and api_key not in keys:
        keys.insert(0, api_key)

    # Add env key as last resort
    env_key = _env_key_for(provider)
    if env_key and env_key not in keys:
        keys.append(env_key)

    return [{"provider": provider, "model": model_id, "key": k} for k in keys if k]
