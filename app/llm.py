from __future__ import annotations

import os

from openai import OpenAI


def client() -> OpenAI:
    api_key = os.getenv("XAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "Falta XAI_API_KEY. Copiá .env.example a .env y pegá tu clave de https://console.x.ai"
        )
    return OpenAI(api_key=api_key, base_url=os.getenv("XAI_BASE_URL", "https://api.x.ai/v1"))


def reply(instructions: str, history: list[dict]) -> str:
    messages = [{"role": "system", "content": instructions}]
    for item in history[-30:]:
        role = item.get("role")
        if role in {"user", "assistant"} and item.get("content"):
            messages.append({"role": role, "content": item["content"]})
    response = client().chat.completions.create(
        model=os.getenv("MODEL", "grok-4.3"),
        messages=messages,
        temperature=0.4,
    )
    return (response.choices[0].message.content or "").strip()
