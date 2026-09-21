from __future__ import annotations

import os
import re
import threading

_GO = re.compile(
    r"abr|captura|computadora|naveg|entra|pasame|investig|github|gmail|"
    r"and[a\u00e1]|login|herramient|base44|a fondo|"
    r"python|bash|c[o\u00f3]digo|calcul|ejecut|terminal|script",
    re.I,
)
_URL = re.compile(r"https?://")
_SLOTS = threading.Semaphore(max(1, int(os.getenv("BASE44_SLOTS", "2"))))


def _last_user(history: list | None) -> str:
    for item in reversed(history or []):
        if item.get("role") != "user":
            continue
        raw = str(item.get("content") or "")
        if raw.startswith("RESULTADO DE TU COMPUTADORA"):
            continue
        return raw
    return ""


def is_heavy(text: str) -> bool:
    blob = text or ""
    if _URL.search(blob) or _GO.search(blob):
        return True
    return len(blob) > 420


def install() -> None:
    from app import llm
    if getattr(llm.reply, "_routed", False):
        return
    orig = llm.reply
    orig_group = llm.reply_messages_routed

    def reply(instructions, history, *, provider=None, scope="default"):
        # Etapa actual: un solo cerebro (DeepHat). Gemini no interviene.
        return orig(instructions, history, provider="deephat", scope=scope)

    def reply_messages_routed(messages, temperature=0.4, *, provider=None, scope="default", instructions=""):
        return orig_group(
            messages, temperature,
            provider="deephat", scope=scope, instructions=instructions,
        )

    reply._routed = True
    llm.reply = reply
    llm.reply_messages_routed = reply_messages_routed
