from __future__ import annotations

import re
import threading

_state = threading.local()
_URL = re.compile(r"https?://[^\s\]\)>”'\"<>]+")
_GO = re.compile(r"abr|captura|computadora|naveg|entra|pasame|and[a\u00e1]|visit|login", re.I)


def remember(messages: list | None) -> None:
    user = ""
    url = getattr(_state, "url", "") or ""
    for item in reversed(messages or []):
        if item.get("role") != "user":
            continue
        raw = str(item.get("content") or "")
        if raw.startswith("RESULTADO DE TU COMPUTADORA"):
            continue
        user = raw
        found = _URL.findall(raw)
        if found:
            url = found[0].rstrip(".,;)]")
            break
        if url:
            break
    _state.user = user
    _state.url = url


def from_user(text: str | None = None) -> dict | None:
    last = getattr(_state, "user", "") or ""
    url = getattr(_state, "url", "") or ""
    blob = (text or "") + "\n" + last
    found = _URL.findall(text or "") or _URL.findall(last)
    if found:
        url = found[0].rstrip(".,;)]")
    if not url:
        return None
    if not _GO.search(last) and not _GO.search(text or ""):
        return None
    return {"tool": "browser", "action": "navigate", "url": url}
