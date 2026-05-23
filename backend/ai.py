import asyncio
import json
import os
import re
import time
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
            {"id": "gemini-2.0-flash-lite", "label": "Gemini 2.0 Flash Lite", "note": "1K/day · 15 RPM · fastest free"},
            {"id": "gemini-2.5-flash",      "label": "Gemini 2.5 Flash",      "note": "250/day · 10 RPM · best quality"},
            {"id": "gemini-2.0-flash",      "label": "Gemini 2.0 Flash",      "note": "100/day · 5 RPM"},
            {"id": "gemini-flash-latest",   "label": "Gemini Flash Latest",   "note": "Always latest"},
        ],
    },
    "groq": {
        "label": "Groq (Ultra-fast)",
        "models": [
            {"id": "llama-3.1-8b-instant",                     "label": "Llama 3.1 8B",      "note": "14.4K/day · 30 RPM · best quota"},
            {"id": "meta-llama/llama-4-scout-17b-16e-instruct", "label": "Llama 4 Scout 17B", "note": "1K/day · 30 RPM · 30K TPM"},
            {"id": "llama-3.3-70b-versatile",                  "label": "Llama 3.3 70B",     "note": "1K/day · best quality"},
            {"id": "qwen/qwen3-32b",                           "label": "Qwen3 32B",         "note": "1K/day · 60 RPM"},
        ],
    },
    "cerebras": {
        "label": "Cerebras (Ultra-fast)",
        "models": [
            {"id": "llama-3.1-8b",  "label": "Llama 3.1 8B",  "note": "1M tok/day · 5 RPM · free"},
            {"id": "llama-3.3-70b", "label": "Llama 3.3 70B", "note": "1M tok/day · 5 RPM · free"},
            {"id": "llama-4-scout", "label": "Llama 4 Scout",  "note": "1M tok/day · 5 RPM · free"},
        ],
    },
    "mistral": {
        "label": "Mistral AI",
        "models": [
            {"id": "mistral-small-latest", "label": "Mistral Small", "note": "Free tier · fast"},
            {"id": "open-mistral-7b",      "label": "Mistral 7B",    "note": "Free tier"},
            {"id": "open-mixtral-8x7b",    "label": "Mixtral 8x7B",  "note": "Free tier"},
        ],
    },
    "openrouter": {
        "label": "OpenRouter (Free tier)",
        "models": [
            {"id": "deepseek/deepseek-r1:free",              "label": "DeepSeek R1",  "note": "Free · high quality"},
            {"id": "deepseek/deepseek-v3-base:free",         "label": "DeepSeek V3",  "note": "Free"},
            {"id": "mistralai/mistral-7b-instruct:free",     "label": "Mistral 7B",   "note": "Free"},
            {"id": "meta-llama/llama-3.2-3b-instruct:free",  "label": "Llama 3.2 3B", "note": "Free"},
            {"id": "qwen/qwen3-8b:free",                     "label": "Qwen3 8B",     "note": "Free"},
        ],
    },
    "claude": {
        "label": "Anthropic Claude",
        "models": [
            {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5",  "note": "Paid · fastest"},
            {"id": "claude-sonnet-4-6",          "label": "Claude Sonnet 4.6", "note": "Paid · recommended"},
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
    "groq":       "GROQ_API_KEY",
    "cerebras":   "CEREBRAS_API_KEY",
    "mistral":    "MISTRAL_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "claude":     "ANTHROPIC_API_KEY",
}

# ── Rate limit table (RPM per lane) ───────────────────────────────────────────
# Used by the parallel dispatcher to know how fast each lane can go.
# Conservative values to stay safely under limits.
LANE_RPM = {
    ("gemini",     "gemini-2.0-flash-lite"):                    12,  # limit 15, leave headroom
    ("gemini",     "gemini-2.5-flash"):                          8,  # limit 10
    ("gemini",     "gemini-2.0-flash"):                          4,  # limit 5
    ("gemini",     "gemini-flash-latest"):                       8,
    ("groq",       "llama-3.1-8b-instant"):                     25,  # limit 30
    ("groq",       "meta-llama/llama-4-scout-17b-16e-instruct"): 25,
    ("groq",       "llama-3.3-70b-versatile"):                  25,
    ("groq",       "qwen/qwen3-32b"):                           50,  # limit 60
    ("cerebras",   "llama-3.1-8b"):                              4,  # limit 5
    ("cerebras",   "llama-3.3-70b"):                             4,
    ("cerebras",   "llama-4-scout"):                             4,
    ("mistral",    "mistral-small-latest"):                     15,
    ("mistral",    "open-mistral-7b"):                          15,
    ("mistral",    "open-mixtral-8x7b"):                        15,
    ("openrouter", "deepseek/deepseek-r1:free"):                15,
    ("openrouter", "deepseek/deepseek-v3-base:free"):           15,
    ("openrouter", "mistralai/mistral-7b-instruct:free"):       15,
    ("openrouter", "meta-llama/llama-3.2-3b-instruct:free"):   15,
    ("openrouter", "qwen/qwen3-8b:free"):                      15,
    ("claude",     "claude-haiku-4-5-20251001"):                40,
    ("claude",     "claude-sonnet-4-6"):                        40,
}

# Fallback chain for single-lead drafting (sequential, no parallelism needed)
AUTO_FALLBACK_CHAIN = [
    ("gemini",     "gemini-2.0-flash-lite"),
    ("gemini",     "gemini-2.5-flash"),
    ("groq",       "llama-3.1-8b-instant"),
    ("groq",       "meta-llama/llama-4-scout-17b-16e-instruct"),
    ("cerebras",   "llama-3.1-8b"),
    ("mistral",    "mistral-small-latest"),
    ("openrouter", "deepseek/deepseek-r1:free"),
    ("openrouter", "mistralai/mistral-7b-instruct:free"),
    ("openrouter", "qwen/qwen3-8b:free"),
    ("groq",       "llama-3.3-70b-versatile"),
    ("claude",     "claude-haiku-4-5-20251001"),
]


_GROQ_NAMESPACED = {"meta-llama/", "qwen/", "openai/"}

def _detect_provider(model_id: str) -> str:
    if model_id.startswith("gemini"):
        return "gemini"
    if model_id.startswith("claude"):
        return "claude"
    if model_id.startswith("mistral") or model_id.startswith("open-"):
        return "mistral"
    if model_id.startswith("llama") or model_id.startswith("cerebras"):
        # could be groq or cerebras — caller should know; default groq
        return "groq"
    if "/" in model_id:
        if any(model_id.startswith(p) for p in _GROQ_NAMESPACED):
            return "groq"
        return "openrouter"
    return "groq"


def _env_key(provider: str) -> Optional[str]:
    return os.getenv(ENV_KEYS.get(provider, "")) or None


# ── Prompt ────────────────────────────────────────────────────────────────────

def _build_prompt(lead: dict, campaign: dict) -> str:
    category = lead['category'].replace('_', ' ').title()
    review = lead.get('review_score') or ''
    review_note = f"{review} stars on Google" if review else "active on Google Maps"
    facebook = lead.get('facebook_url') or ''
    social_note = f"Facebook at {facebook}" if facebook else "no social media presence"
    sender = campaign['sender_name']

    return f"""You are writing a cold email on behalf of {sender} from Arcen Studio (Mumbai, India — web design & AI automation agency).

LEAD INFO:
- Business: {lead['name']} ({category}, {lead['city']})
- Online presence: {review_note}, {social_note}, NO WEBSITE
- Services we offer: {campaign['services']}

STRICT RULES — violate any of these and the output is rejected:
1. FORBIDDEN phrases (never use): "I hope this email finds you", "I came across", "I noticed", "game-changer", "take your business to the next level", "I wanted to reach out", "digital presence", "online presence", "leverage", "revolutionary", "innovative", "transform your business"
2. Opening line must be a single punchy observation — NOT an introduction. No "Hi, my name is". Jump straight into a specific insight about their situation or their competitors.
3. Mention a concrete fact: other {category} businesses in {lead['city']} that are booking online, running Google Ads, or using AI chatbots to handle enquiries 24/7 — and {lead['name']} is missing this revenue.
4. What we do: Arcen Studio builds websites + AI automations (auto-reply bots, booking systems, lead capture) for local businesses. One-time build, no monthly agency retainer.
5. CTA: Invite them to a quick 5-minute Zoom call — but the ONLY way to get there is replying to this email. Write it naturally, like "If you're up for a quick 5-min Zoom to see if it's a fit, just reply here." No Calendly links, no phone numbers, no "schedule a call", no "book a meeting".
6. Sign off: {sender}\\nArcen Studio
7. Body must be under 130 words. Short sentences. No bullet points. No corporate speak. Sound like a human who did 5 minutes of research, not a marketing department.
8. Subject line: specific to {lead['name']}, max 8 words, no exclamation marks, no all-caps.
9. FORMATTING: The body field must use \\n\\n to separate each paragraph. Structure must be exactly 4 paragraphs: (1) hook/observation, (2) competitor gap, (3) what we do + no retainer, (4) CTA line. Then a blank line, then the sign-off. Like this example structure:
   "Other groomers in Coal City are booking online while you\\'re still on calls.\\n\\nPet Palace runs Google Ads and an AI chatbot — they\\'re pulling enquiries 24/7 without picking up the phone.\\n\\nWe build websites and AI automations for local businesses. One-time cost, no monthly agency fees.\\n\\nIf you\\'re up for a quick 5-min Zoom to see if it\\'s a fit, just reply here.\\n\\n{sender}\\nArcen Studio"

OUTPUT FORMAT (strict JSON, no markdown, no code fences):
{{"research":"2 sentence max: what {category} businesses in {lead['city']} are doing online that {lead['name']} isn't — be specific","subject":"...","body":"..."}}"""


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
            max_output_tokens=1024,
            response_mime_type="application/json",
        ),
    )
    return _parse_json(response.text)


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


async def _call_cerebras(model_id: str, api_key: str, prompt: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.cerebras.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
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


async def _call_mistral(model_id: str, api_key: str, prompt: str) -> dict:
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.mistral.ai/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
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


_CALLERS = {
    "gemini":     _call_gemini,
    "groq":       _call_groq,
    "cerebras":   _call_cerebras,
    "mistral":    _call_mistral,
    "openrouter": _call_openrouter,
    "claude":     _call_claude,
}


def _is_quota_error(err: str) -> bool:
    err = err.lower()
    return any(k in err for k in ("429", "resource_exhausted", "quota", "rate limit", "rpd", "rpm", "too many"))


# ── Token-bucket rate limiter ──────────────────────────────────────────────────

class _TokenBucket:
    """Allows at most `rpm` calls per 60 seconds, enforced via async sleep."""

    def __init__(self, rpm: int):
        self.interval = 60.0 / max(rpm, 1)  # seconds per token
        self._next_allowed = 0.0
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                await asyncio.sleep(wait)
            self._next_allowed = max(self._next_allowed, time.monotonic()) + self.interval


# ── Lane: one provider+model+key combination ──────────────────────────────────

class _Lane:
    def __init__(self, provider: str, model_id: str, key: str):
        self.provider = provider
        self.model_id = model_id
        self.key = key
        rpm = LANE_RPM.get((provider, model_id), 10)
        self.bucket = _TokenBucket(rpm)
        self.exhausted = False   # True when RPD quota is gone for the day
        self.frozen_until = 0.0  # epoch time; lane is paused after a 429

    def is_available(self) -> bool:
        return not self.exhausted and time.monotonic() >= self.frozen_until

    def freeze(self, seconds: float):
        self.frozen_until = time.monotonic() + seconds

    async def call(self, prompt: str) -> dict:
        await self.bucket.acquire()
        caller = _CALLERS[self.provider]
        return await caller(self.model_id, self.key, prompt)


# ── Parallel batch dispatcher ─────────────────────────────────────────────────
#
# Design:
#   - One worker coroutine per lane. Workers pull from a shared asyncio.Queue.
#   - Each worker tries ITS OWN lane's token bucket first, then on any failure
#     immediately falls back through ALL other available lanes — no re-queuing.
#   - task_done() is called exactly once per item, only after the item is fully
#     resolved (success or permanent error). This fixes the broken queue counter
#     that caused premature join() and workers being cancelled mid-flight.
#   - RPM 429 → freeze that lane 60s but the current item already tried a
#     fallback lane, so it never gets stuck waiting.
#   - RPD exhaustion → lane.exhausted = True, skipped by all workers forever.

class ParallelDispatcher:
    def __init__(self, lanes: list, on_result, on_error, stop_event: asyncio.Event):
        self.lanes = [l for l in lanes if l.is_available()]
        self.on_result = on_result
        self.on_error = on_error
        self.stop_event = stop_event
        self._queue: asyncio.Queue = asyncio.Queue()

    def enqueue(self, lead_id: int, prompt: str):
        self._queue.put_nowait((lead_id, prompt))

    async def run(self):
        if not self.lanes:
            return
        workers = [asyncio.create_task(self._worker(i)) for i in range(len(self.lanes))]
        await self._queue.join()
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)

    async def _worker(self, lane_idx: int):
        """Each worker owns one lane but falls back through others on failure."""
        while not self.stop_event.is_set():
            try:
                lead_id, prompt = await asyncio.wait_for(
                    self._queue.get(), timeout=0.5
                )
            except asyncio.TimeoutError:
                continue

            result = await self._try_all_lanes(lane_idx, prompt)

            if result is not None:
                await self.on_result(lead_id, result)
            else:
                await self.on_error(lead_id, "All lanes failed for this lead", True)

            self._queue.task_done()

    async def _try_all_lanes(self, preferred_idx: int, prompt: str) -> Optional[dict]:
        """Try preferred lane first, then round-robin through the rest."""
        n = len(self.lanes)
        order = [preferred_idx] + [(preferred_idx + i) % n for i in range(1, n)]

        for idx in order:
            if self.stop_event.is_set():
                return None
            lane = self.lanes[idx]
            if lane.exhausted:
                continue

            # Wait for this lane's rate-limit window (token bucket)
            # but don't wait more than 30s — move to next lane instead
            waited = 0.0
            while not lane.is_available():
                if waited >= 30:
                    break
                await asyncio.sleep(1)
                waited += 1
            if not lane.is_available():
                continue

            try:
                result = await lane.call(prompt)
                result["model_used"] = lane.model_id
                result["provider_used"] = lane.provider
                return result
            except Exception as e:
                err_str = str(e)
                is_quota = _is_quota_error(err_str)
                if is_quota:
                    is_rpd = any(k in err_str.lower() for k in ("rpd", "daily", "day limit", "exhausted"))
                    if is_rpd:
                        lane.exhausted = True
                    else:
                        lane.freeze(60)
                    # Don't return — try next lane immediately
                else:
                    # Non-quota error (network, parse, etc.) — retry this lane once
                    await asyncio.sleep(2)
                    try:
                        result = await lane.call(prompt)
                        result["model_used"] = lane.model_id
                        result["provider_used"] = lane.provider
                        return result
                    except Exception:
                        pass  # fall through to next lane

        return None  # all lanes failed


# ── Public API ────────────────────────────────────────────────────────────────

async def draft_lead(
    lead: dict,
    campaign: dict,
    providers_config: Optional[list] = None,
    api_key: Optional[str] = None,
    api_keys: Optional[list] = None,
    model: Optional[str] = None,
) -> dict:
    """Single-lead draft — sequential fallback, used by the single-draft button."""
    prompt = _build_prompt(lead, campaign)
    attempts = _build_attempt_list(providers_config, api_key, api_keys, model)

    if not attempts:
        raise ValueError(
            "No AI provider configured. Add at least one API key in Configure → AI Configuration, "
            "or set GEMINI_API_KEY / GROQ_API_KEY / CEREBRAS_API_KEY / MISTRAL_API_KEY in backend/.env"
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
                if _is_quota_error(str(e).lower()):
                    break
                if attempt < 2:
                    await asyncio.sleep(2 ** attempt * 2)
        errors.append(f"{provider}/{model_id}: {last_err}")

    raise RuntimeError("All providers exhausted. Errors: " + " | ".join(errors))


def build_lanes(providers_config: Optional[list], api_key: Optional[str],
                api_keys: Optional[list], model: Optional[str]) -> list:
    """Build lane list from user config + env keys. Called by the batch dispatcher."""
    attempts = _build_attempt_list(providers_config, api_key, api_keys, model)
    seen = set()
    lanes = []
    for provider, model_id, key in attempts:
        sig = (provider, model_id, key)
        if sig not in seen and provider in _CALLERS:
            seen.add(sig)
            lanes.append(_Lane(provider, model_id, key))
    return lanes


def _build_attempt_list(
    providers_config: Optional[list],
    api_key: Optional[str],
    api_keys: Optional[list],
    model: Optional[str],
) -> list:
    result = []

    if providers_config:
        for entry in providers_config:
            p = entry.get("provider", "gemini")
            m = entry.get("model", "gemini-2.0-flash-lite")
            k = entry.get("key", "").strip() or _env_key(p)
            if k:
                result.append((p, m, k))

    if not result and (api_key or api_keys):
        m = model or "gemini-2.0-flash-lite"
        p = _detect_provider(m)
        keys = list(api_keys or [])
        if api_key and api_key not in keys:
            keys.insert(0, api_key)
        for k in keys:
            if k and k.strip():
                result.append((p, m, k.strip()))

    env_fallbacks = []
    for p, m in AUTO_FALLBACK_CHAIN:
        k = _env_key(p)
        if k:
            entry = (p, m, k)
            if entry not in result:
                env_fallbacks.append(entry)

    if not result:
        result = env_fallbacks
    else:
        result.extend(env_fallbacks)

    return result
