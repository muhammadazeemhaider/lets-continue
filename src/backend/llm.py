"""Tiny OpenRouter client: JSON answers from free chat models, with fallback across models.

Free models come and go and are rate-limited upstream, so `complete_json` walks an ordered list,
skips models that recently answered 429 for a cool-down period, and raises LLMError only when
every model failed. Callers always have a template fallback.
"""
import json
import logging
import os
import re
import time

import requests

log = logging.getLogger("llm")

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Chosen by a bake-off on the real recap prompt (quality, latency, JSON compliance, spoiler discipline).
DEFAULT_MODELS = [
    "baidu/ernie-5.5-flash-preview:free",      # ~3 s, accurate, spoiler-safe
    "nvidia/nemotron-3-ultra-550b-a55b:free",  # ~12 s, accurate
    "google/gemma-4-31b-it:free",              # good when not rate-limited
    "openrouter/free",                         # OpenRouter picks any free model
]
RATE_LIMIT_COOLDOWN = 120  # seconds to skip a model after it answered 429


class LLMError(Exception):
    pass


def parse_json_object(text: str) -> dict:
    """Pull the first JSON object out of a model reply (tolerates code fences and chatter)."""
    if not text:
        raise ValueError("empty reply")
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.IGNORECASE)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("no JSON object in reply")
    data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("reply is not a JSON object")
    return data


class OpenRouterClient:
    def __init__(self, api_key: str, models: list[str] | None = None, timeout: float = 20.0, session=None):
        if not api_key:
            raise ValueError("OpenRouter API key is required")
        self.api_key = api_key
        self.models = models or DEFAULT_MODELS
        self.timeout = timeout
        self.http = session or requests.Session()
        self._cooldown_until: dict[str, float] = {}

    def complete_json(self, system: str, user: str, max_tokens: int = 1500, temperature: float = 0.7) -> tuple[dict, str]:
        # The budget is generous on purpose: free "thinking" models spend tokens before answering, and
        # free models cost nothing per token. The prompts ask for a few short sentences.
        """Returns (parsed JSON object, model that answered). Raises LLMError if every model failed."""
        errors = []
        now = time.monotonic()
        candidates = [m for m in self.models if self._cooldown_until.get(m, 0) <= now] or self.models
        for model in candidates:
            try:
                return self._ask(model, system, user, max_tokens, temperature), model
            except _RateLimited as e:
                self._cooldown_until[model] = time.monotonic() + RATE_LIMIT_COOLDOWN
                errors.append(f"{model}: rate-limited")
                log.info("LLM %s rate-limited: %s", model, e)
            except Exception as e:  # timeout, provider error, unusable reply -> try the next model
                errors.append(f"{model}: {type(e).__name__}: {e}"[:200])
                log.info("LLM %s failed: %s", model, e)
        raise LLMError("; ".join(errors) or "no models configured")

    def _ask(self, model, system, user, max_tokens, temperature) -> dict:
        resp = self.http.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {self.api_key}", "X-Title": "Toward the Light"},
            json={
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "max_tokens": max_tokens,
                "temperature": temperature,
                # Keep "thinking" models from spending the whole budget before answering.
                "reasoning": {"effort": "low", "exclude": True},
            },
            timeout=self.timeout,
        )
        if resp.status_code == 429:
            raise _RateLimited(resp.text[:200])
        try:
            data = resp.json()
        except ValueError:
            raise LLMError(f"HTTP {resp.status_code}: non-JSON response")
        if resp.status_code != 200 or "choices" not in data:
            err = (data.get("error") or {}) if isinstance(data, dict) else {}
            if err.get("code") == 429:
                raise _RateLimited(str(err)[:200])
            raise LLMError(f"HTTP {resp.status_code}: {str(err.get('message') or data)[:160]}")
        choice = data["choices"][0]
        content = (choice.get("message") or {}).get("content") or ""
        if not content.strip():
            # Usually a "thinking" model that spent the whole budget before answering (finish_reason=length).
            raise LLMError(f"empty reply (finish_reason={choice.get('finish_reason')})")
        return parse_json_object(content)


class _RateLimited(Exception):
    pass


def client_from_env() -> "OpenRouterClient | None":
    """Build a client from OPENROUTER_API_KEY / LLM_MODELS, or None when no key is configured."""
    key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not key:
        return None
    models = [m.strip() for m in os.environ.get("LLM_MODELS", "").split(",") if m.strip()] or None
    return OpenRouterClient(key, models, timeout=float(os.environ.get("LLM_TIMEOUT_SECONDS", 20)))


def load_dotenv(path) -> None:
    """Minimal .env loader (KEY=value lines). Real environment variables win."""
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
