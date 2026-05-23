import asyncio
import json
import os
import re
from typing import Optional

SYSTEM_PROMPT = (
    "You are a cold email copywriter for a premium web development studio. "
    "You write concise, personalized, non-generic cold emails that feel human."
)

# ── Provider + model catalogue ─────────────────────────────────────────────────

PROVIDERS = {
    "gemini": {
        "label": "Google Gemini",
        "models": [
            {"id": "gemini-2.5-flash",      "label": "Gemini 2.5 Flash",      "note": "Recommended · free tier"},
            {"id": "gemini-2.0-flash",       "label": "Gemini 2.0 Flash",      "note": "200 req/day free"},
            {"id": "gemini-2.0-flash-lite",  "label": "Gemini 2.0 Flash Lite", "note": "Cheapest"},
            {"id": "gemini-2.5-pro",         "label": "Gemini 2.5 Pro",        "note": "Best quality"},
            {"id": "gemini-flash-latest",    "label": "Gemini Flash Latest",   "note": "Always latest"},
        ],
    },
    "claude": {
        "label": "Anthropic Claude",
        "models": [
            {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5",  "note": "Fastest"},
            {"id": "claude-sonnet-4-6",          "label": "Claude Sonnet 4.6", "note": "Recommended"},
            {"id": "claude-opus-4-7",            "label": "Claude Opus 4.7",   "note": "Most capable"},
        ],
    },
    "groq": {
        "label": "Groq (Ultra-fast)",
        "models": [
            {"id": "llama-3.1-8b-instant",                    "label": "Llama 3.1 8B",         "note": "14.4K/day · Recommended"},
            {"id": "meta-llama/llama-4-scout-17b-16e-instruct","label": "Llama 4 Scout 17B",    "note": "1K/day · high quality"},
            {"id": "llama-3.3-70b-versatile",                  "label": "Llama 3.3 70B",        "note": "1K/day · best quality"},
            {"id": "qwen/qwen3-32b",                           "label": "Qwen3 32B",            "note": "1K/day · 60 RPM"},
        ],
    },
    "openrouter": {
        "label": "OpenRouter (Free tier)",
        "models": [
            {"id": "mistralai/mistral-7b-instruct:free",     "label": "Mistral 7B",   "note": "Free"},
            {"id": "meta-llama/llama-3.2-3b-instruct:free", "label": "Llama 3.2 3B", "note": "Free"},
            {"id": "google/gemma-3-4b-it:free",             "label": "Gemma 3 4B",   "note": "Free"},
            {"id": "qwen/qwen3-8b:free",                    "label": "Qwen3 8B",     "note": "Free"},
        ],
    },
}

AVAILABLE_MODELS = [
    {
        "provider": pid,
        "provider_label": meta["label"],
        "id": m["id"],
        "label": m["label"],
        "note": m["note"],
    }
    for pid, meta in PROVIDERS.items()
    for m in meta["models"]
]

ENV_KEYS = {
    "gemini":     "GEMINI_API_KEY",
    "claude":     "ANTHROPIC_API_KEY",
    "groq":       "GROQ_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
}

# Auto-fallback chain used when a specific provider hits quota/error.
# Order: Gemini 2.5 Flash → Gemini 2.0 Flash → Gemini Flash Latest →
#        Claude Haiku → Groq Llama → OpenRouter free models
AUTO_FALLBACK_CHAIN = [
    ("gemini",     "gemini-2.5-flash"),
    ("gemini",     "gemini-2.0-flash"),
    ("gemini",     "gemini-flash-latest"),
    ("groq",       "llama-3.1-8b-instant"),                     # 14.4K RPD — best Groq quota
    ("groq",       "meta-llama/llama-4-scout-17b-16e-instruct"), # 1K RPD · better quality
    ("groq",       "llama-3.3-70b-versatile"),                  # 1K RPD · use last
    ("openrouter", "mistralai/mistral-7b-instruct:free"),
    ("openrouter", "meta-llama/llama-3.2-3b-instruct:free"),
    ("openrouter", "qwen/qwen3-8b:free"),
    ("claude",     "claude-haiku-4-5-20251001"),
]


_GROQ_NAMESPACED = {"meta-llama/", "qwen/", "openai/"}

def _detect_provider(model_id: str) -> str:
    if model_id.startswith("gemini") or model_id.startswith("gemma"):
        return "gemini"
    if model_id.startswith("claude"):
        return "claude"
    if "/" in model_id:
        # Groq hosts some models under vendor namespaces
        if any(model_id.startswith(prefix) for prefix in _GROQ_NAMESPACED):
            return "groq"
        return "openrouter"
    return "groq"


def _env_key(provider: str) -> Optional[str]:
    return os.getenv(ENV_KEYS.get(provider, "")) or None


# ── Prompt ────────────────────────────────────────────────────────────────────

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

Respond ONLY in this exact JSON format:
{{"research":"...","subject":"...","body":"..."}}"""


def _parse_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```(?:json)?\s*\n?", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\n?```\s*$", "", raw)
    raw = raw.strip()
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        raw = match.group(0)
    parsed = json.loads(raw)
    if not all(k in parsed for k in ("research", "subject", "body")):
        raise ValueError(f"Missing keys: {list(parsed.keys())}")
    return parsed


# ── Provider callers ──────────────────────────────────────────────────────────

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
            max_output_tokens=2048,
            response_mime_type="application/json",
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
        return _parse_json(resp.json()["choices"][0]["message"]["content"])


_CALLERS = {
    "gemini":     _call_gemini,
    "claude":     _call_claude,
    "groq":       _call_groq,
    "openrouter": _call_openrouter,
}


def _is_quota_error(err: str) -> bool:
    return any(k in err for k in ("429", "RESOURCE_EXHAUSTED", "quota", "rate limit", "RPD", "RPM"))


# ── Main entry point ──────────────────────────────────────────────────────────

async def draft_lead(
    lead: dict,
    campaign: dict,
    providers_config: Optional[list] = None,
    api_key: Optional[str] = None,
    api_keys: Optional[list] = None,
    model: Optional[str] = None,
) -> dict:
    """
    Returns: {research, subject, body, model_used, provider_used}

    Priority:
    1. providers_config from frontend (user-configured priority list)
    2. Legacy single-key / api_keys params
    3. Auto-fallback: tries every provider+model that has an env key,
       in AUTO_FALLBACK_CHAIN order
    """
    prompt = _build_prompt(lead, campaign)

    # Build the full attempt list
    attempts = _build_attempt_list(providers_config, api_key, api_keys, model)

    if not attempts:
        raise ValueError(
            "No AI provider configured. Add at least one API key in Configure → AI Configuration, "
            "or set GEMINI_API_KEY / ANTHROPIC_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY in backend/.env"
        )

    errors = []

    for provider, model_id, key in attempts:
        caller = _CALLERS.get(provider)
        if not caller:
            continue

        last_err = None
        for attempt in range(3):
            try:
                result = await caller(model_id, key, prompt)
                result["model_used"] = model_id
                result["provider_used"] = provider
                return result
            except Exception as e:
                last_err = e
                err_str = str(e)
                # Quota/rate-limit: skip retries, move to next provider immediately
                if _is_quota_error(err_str.lower()):
                    break
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt * 2)

        errors.append(f"{provider}/{model_id}: {last_err}")

    raise RuntimeError(
        "All providers exhausted. Errors: " + " | ".join(errors)
    )


def _build_attempt_list(
    providers_config: Optional[list],
    api_key: Optional[str],
    api_keys: Optional[list],
    model: Optional[str],
) -> list:
    """Returns list of (provider, model_id, key) tuples to try in order."""
    result = []

    # 1. User-configured priority list from frontend
    if providers_config:
        for entry in providers_config:
            p = entry.get("provider", "gemini")
            m = entry.get("model", "gemini-2.5-flash")
            k = entry.get("key", "").strip() or _env_key(p)
            if k:
                result.append((p, m, k))

    # 2. Legacy single/multi key params
    if not result and (api_key or api_keys):
        m = model or "gemini-2.5-flash"
        p = _detect_provider(m)
        keys = list(api_keys or [])
        if api_key and api_key not in keys:
            keys.insert(0, api_key)
        for k in keys:
            if k and k.strip():
                result.append((p, m, k.strip()))

    # 3. Auto-fallback from env vars — append after user config so they're last resort
    #    (or primary if nothing configured at all)
    env_fallbacks = []
    for p, m in AUTO_FALLBACK_CHAIN:
        k = _env_key(p)
        if k:
            entry = (p, m, k)
            # Don't duplicate entries already in result
            if entry not in result:
                env_fallbacks.append(entry)

    if not result:
        # Nothing configured — use full fallback chain
        result = env_fallbacks
    else:
        # User configured something — append env fallbacks at the end
        result.extend(env_fallbacks)

    return result
