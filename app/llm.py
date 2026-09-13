from __future__ import annotations

import os

from openai import OpenAI

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
XAI_URL = "https://api.x.ai/v1"


def _keys() -> tuple[str, str]:
    gemini = os.getenv("GEMINI_API_KEY", "").strip()
    xai = os.getenv("XAI_API_KEY", "").strip()
    return gemini, xai


def _is_xai(key: str) -> bool:
    return key.startswith("xai-")


def client() -> OpenAI:
    gemini, xai = _keys()
    if gemini:
        return OpenAI(api_key=gemini, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))
    if xai and not _is_xai(xai):
        return OpenAI(api_key=xai, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))
    if xai:
        return OpenAI(api_key=xai, base_url=os.getenv("XAI_BASE_URL", XAI_URL))
    raise RuntimeError("Falta GEMINI_API_KEY (o XAI_API_KEY con la clave de Gemini).")


def default_model() -> str:
    configured = os.getenv("MODEL", "").strip()
    gemini, xai = _keys()
    using_gemini = bool(gemini or (xai and not _is_xai(xai)))
    if configured:
        return configured
    return "gemini-2.5-flash" if using_gemini else "grok-4.3"


def reply(instructions: str, history: list[dict]) -> str:
    messages = [{"role": "system", "content": instructions}]
    for item in history[-30:]:
        role = item.get("role")
        if role in {"user", "assistant"} and item.get("content"):
            messages.append({"role": role, "content": item["content"]})
    response = client().chat.completions.create(
        model=default_model(),
        messages=messages,
        temperature=0.4,
    )
    return (response.choices[0].message.content or "").strip()
