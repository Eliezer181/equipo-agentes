from __future__ import annotations

import json
from pathlib import Path

from app.store import DATA

_LIVE: dict[str, str] = {}


def _path(agent_id: str) -> Path:
    return DATA / "computers" / (agent_id or "x") / ".live.json"


def live_for_tool(tool: dict) -> str:
    kind = (tool or {}).get("tool")
    act = str((tool or {}).get("action") or "").lower()
    if kind == "browser":
        if act == "screenshot":
            return "Tomando captura…"
        if act in {"start", "navigate"}:
            return "Entrando al navegador…"
        if act in {"click", "click_text"}:
            return "Haciendo clic…"
        if act in {"type", "key"}:
            return "Escribiendo…"
        if act in {"read", "elements"}:
            return "Leyendo la página…"
        if act == "scroll":
            return "Desplazando…"
        if act == "back":
            return "Volviendo atrás…"
        return "En el navegador…"
    if kind == "fetch":
        return "Abriendo la página…"
    if kind == "bash":
        return "Ejecutando comando…"
    if kind == "python":
        return "Corriendo código…"
    if kind in {"write", "read"}:
        return "En archivos…"
    if kind == "vault":
        return "En el vault…"
    return "Razonando…"


def set_live(agent_id: str, text: str) -> None:
    aid = (agent_id or "").strip()
    _LIVE[aid] = text or ""
    p = _path(aid)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"text": text or ""}, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def get_live(agent_id: str) -> str:
    aid = (agent_id or "").strip()
    if aid in _LIVE:
        return _LIVE[aid]
    p = _path(aid)
    try:
        if p.exists():
            return (json.loads(p.read_text(encoding="utf-8")) or {}).get("text") or ""
    except Exception:
        pass
    return ""


def install() -> None:
    from app import computer
    if getattr(computer.execute_tool, "_live_wrapped", False):
        return
    orig = computer.execute_tool

    def wrapped(agent_id, agent_name=None, tool=None, is_pro=False, base_url="", **kw):
        set_live(agent_id, live_for_tool(tool or {}))
        try:
            return orig(agent_id, agent_name, tool, is_pro=is_pro, base_url=base_url, **kw)
        finally:
            pass

    wrapped._live_wrapped = True
    computer.execute_tool = wrapped
