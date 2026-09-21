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
        want = llm.resolve_provider(provider)
        # DeepHat / Base44 pedidos en serio no se pisan con Gemini.
        # Gemini solo entra en turns livianos cuando el default era Gemini.
        if want not in {"deephat", "base44"} and not is_heavy(_last_user(history)):
            want = "gemini"
        if want == "base44":
            with _SLOTS:
                return orig(instructions, history, provider="base44", scope=scope)
        return orig(instructions, history, provider=want, scope=scope)

    def reply_messages_routed(messages, temperature=0.4, *, provider=None, scope="default", instructions=""):
        hist = [m for m in (messages or []) if m.get("role") in {"user", "assistant"}]
        want = llm.resolve_provider(provider)
        if want not in {"deephat", "base44"} and not is_heavy(_last_user(hist)):
            want = "gemini"
        if want == "base44":
            with _SLOTS:
                return orig_group(
                    messages, temperature,
                    provider="base44", scope=scope, instructions=instructions,
                )
        return orig_group(
            messages, temperature,
            provider=want, scope=scope, instructions=instructions,
        )

    reply._routed = True
    llm.reply = reply
    llm.reply_messages_routed = reply_messages_routed
