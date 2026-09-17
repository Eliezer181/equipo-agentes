from __future__ import annotations

import re

_LAST_USER = ""
_LAST_URL = ""
_URL = re.compile(r"https?://[^\s\]\)>”'\"<>]+")
_GO = re.compile(r"abr|captura|computadora|naveg|entra|pasame|and[a\u00e1]|visit|login", re.I)


def remember(messages: list | None) -> None:
    global _LAST_USER, _LAST_URL
    for item in reversed(messages or []):
        if item.get("role") != "user":
            continue
        raw = str(item.get("content") or "")
        if raw.startswith("RESULTADO DE TU COMPUTADORA"):
            continue
        _LAST_USER = raw
        found = _URL.findall(raw)
        if found:
            _LAST_URL = found[0].rstrip(".,;)]")
            break
        if _LAST_URL:
            break


def from_user(text: str | None = None) -> dict | None:
    blob = (text or "") + "\n" + _LAST_USER
    url = _LAST_URL
    found = _URL.findall(text or "") or _URL.findall(_LAST_USER)
    if found:
        url = found[0].rstrip(".,;)]")
    if not url:
        return None
    if not _GO.search(_LAST_USER) and not _GO.search(text or ""):
        return None
    return {"tool": "browser", "action": "navigate", "url": url}
