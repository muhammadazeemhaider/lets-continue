"""Backend JSON clients for Gemini and legacy OpenRouter deployments.

Both providers share model failover and rate-limit cooldowns. Callers keep their
existing recap prompts, caching and template fallbacks.
"""
import json
import logging
import os
import re
import time
from urllib.parse import quote

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
DEFAULT_GEMINI_MODELS = ["gemini-3.5-flash-lite"]
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models"
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


class GeminiClient(OpenRouterClient):
    """Native Gemini generateContent adapter; reuses model failover and cooldowns."""

    def __init__(self, api_key: str, models: list[str] | None = None, timeout: float = 20.0, session=None):
        if not api_key:
            raise ValueError("Gemini API key is required")
        super().__init__(api_key, models or DEFAULT_GEMINI_MODELS, timeout, session)

    def _ask(self, model, system, user, max_tokens, temperature) -> dict:
        model_id = model.removeprefix("models/")
        resp = self.http.post(
            f"{GEMINI_URL}/{quote(model_id, safe='')}:generateContent",
            headers={"x-goog-api-key": self.api_key},
            json={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "maxOutputTokens": max_tokens,
                    "temperature": temperature,
                },
            },
            timeout=self.timeout,
        )
        if resp.status_code == 429:
            raise _RateLimited("Gemini rate limit reached")
        try:
            data = resp.json()
        except ValueError:
            raise LLMError(f"HTTP {resp.status_code}: non-JSON response")
        if resp.status_code != 200 or not isinstance(data, dict):
            # Do not log provider response bodies (they can contain input text).
            raise LLMError(f"Gemini HTTP {resp.status_code}")
        candidates = data.get("candidates") or []
        if not candidates:
            reason = (data.get("promptFeedback") or {}).get("blockReason", "no candidates")
            raise LLMError(f"Gemini returned no answer ({reason})")
        candidate = candidates[0]
        finish = candidate.get("finishReason")
        if finish and finish != "STOP":
            raise LLMError(f"Gemini incomplete reply (finish_reason={finish})")
        parts = (candidate.get("content") or {}).get("parts") or []
        content = "".join(part.get("text", "") for part in parts if not part.get("thought"))
        return parse_json_object(content)


def client_from_env() -> "OpenRouterClient | GeminiClient | None":
    """Prefer Gemini when configured; keep existing OpenRouter-only setups working.

    An explicit provider never falls back to another provider's credentials.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    router_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if not provider:
        provider = "gemini" if gemini_key or not router_key else "openrouter"
    if provider not in {"gemini", "openrouter"}:
        raise ValueError("LLM_PROVIDER must be gemini or openrouter")
    key = gemini_key if provider == "gemini" else router_key
    if not key:
        return None
    model_env = "GEMINI_MODELS" if provider == "gemini" else "LLM_MODELS"
    models = [m.strip() for m in os.environ.get(model_env, "").split(",") if m.strip()] or None
    client_type = GeminiClient if provider == "gemini" else OpenRouterClient
    return client_type(key, models, timeout=float(os.environ.get("LLM_TIMEOUT_SECONDS", 20)))


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
