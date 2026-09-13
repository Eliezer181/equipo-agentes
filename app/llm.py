from __future__ import annotations

import os

from openai import OpenAI

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
XAI_URL = "https://api.x.ai/v1"


def client() -> OpenAI:
    gemini = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini:
        return OpenAI(api_key=gemini, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))

    xai = os.getenv("XAI_API_KEY", "").strip()
    if xai:
        return OpenAI(api_key=xai, base_url=os.getenv("XAI_BASE_URL", XAI_URL))

    raise RuntimeError(
        "Falta GEMINI_API_KEY. Creala en https://aistudio.google.com/apikey y cargala en Fly."
    )


def default_model() -> str:
    if os.getenv("GEMINI_API_KEY", "").strip():
        return os.getenv("MODEL", "gemini-2.5-flash")
    return os.getenv("MODEL", "grok-4.3")


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
