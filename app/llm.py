from __future__ import annotations

import os

from openai import OpenAI

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
XAI_URL = "https://api.x.ai/v1"
GEMINI_MODELS = (
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
)
RETRYABLE = ("model not found", "invalid-argument", "not found", "does not exist")


def _keys() -> tuple[str, str]:
    gemini = os.getenv("GEMINI_API_KEY", "").strip()
    xai = os.getenv("XAI_API_KEY", "").strip()
    return gemini, xai


def _is_xai(key: str) -> bool:
    return key.startswith("xai-")


def _using_gemini() -> bool:
    gemini, xai = _keys()
    return bool(gemini or (xai and not _is_xai(xai)))


def client() -> OpenAI:
    gemini, xai = _keys()
    if gemini:
        return OpenAI(api_key=gemini, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))
    if xai and not _is_xai(xai):
        return OpenAI(api_key=xai, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))
    if xai:
        return OpenAI(api_key=xai, base_url=os.getenv("XAI_BASE_URL", XAI_URL))
    raise RuntimeError("Falta GEMINI_API_KEY (o XAI_API_KEY con la clave de Gemini).")


def _models() -> list[str]:
    configured = os.getenv("MODEL", "").strip()
    if not _using_gemini():
        return [configured or "grok-4.3"]
    out: list[str] = []
    if configured and "2.5" not in configured and "2.0" not in configured:
        out.append(configured)
    for name in GEMINI_MODELS:
        if name not in out:
            out.append(name)
    return out


def reply_messages(messages: list[dict]) -> str:
    """Prueba los modelos en orden hasta que uno responda."""
    last_error = None
    api = client()
    for model in _models():
        try:
            response = api.chat.completions.create(
                model=model,
                messages=messages,
                temperature=0.4,
            )
            return (response.choices[0].message.content or "").strip()
        except Exception as exc:
            last_error = exc
            text = str(exc).lower()
            if any(marker in text for marker in RETRYABLE):
                continue
            raise
    raise last_error or RuntimeError("No se pudo usar ningún modelo")


def reply(instructions: str, history: list[dict]) -> str:
    messages = [{"role": "system", "content": instructions}]
    for item in history[-30:]:
        role = item.get("role")
        if role in {"user", "assistant"} and item.get("content"):
            messages.append({"role": role, "content": item["content"]})
    return reply_messages(messages)
