from __future__ import annotations

import base64
import json
import time
from pathlib import Path

from app.store import DATA

_LIVE: dict[str, dict] = {}

_SHOT_HINT = (
    "\nSi el usuario dice 'pasame una captura', 'captura de Google' o "
    "'entrá al navegador y pasame una captura', no preguntes nada: "
    "un solo navigate a https://www.google.com (o la URL que nombró). "
    "Al navegar YA viene la captura. En la respuesta final mostrá "
    "![captura](la_url). No hagas read ni elements ni otra ronda."
)


def _path(agent_id: str) -> Path:
    return DATA / "computers" / (agent_id or "x") / ".live.json"


def live_for_tool(tool: dict) -> str:
    kind = (tool or {}).get("tool")
    act = str((tool or {}).get("action") or "").lower()
    if kind == "github":
        return "En GitHub…"
    if kind == "gmail":
        return "En Gmail…"
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
    payload = {"text": text or "", "at": time.time()}
    _LIVE[aid] = payload
    p = _path(aid)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def get_live(agent_id: str) -> str:
    aid = (agent_id or "").strip()
    if aid in _LIVE:
        return (_LIVE[aid] or {}).get("text") or ""
    p = _path(aid)
    try:
        if p.exists():
            return (json.loads(p.read_text(encoding="utf-8")) or {}).get("text") or ""
    except Exception:
        pass
    return ""


def save_upload(agent_id: str, data_url: str) -> dict:
    raw = data_url.split(",", 1)[-1]
    blob = base64.b64decode(raw)
    dest = DATA / "computers" / agent_id / "screenshots"
    dest.mkdir(parents=True, exist_ok=True)
    name = "upload.png"
    (dest / name).write_bytes(blob)
    return {
        "ok": True,
        "name": name,
        "url": f"/api/specialists/{agent_id}/browser/shot/{name}",
        "size": len(blob),
    }


def _latest_shot(agent_id: str, base_url: str = "") -> str:
    dest = DATA / "computers" / agent_id / "screenshots"
    if not dest.exists():
        return ""
    files = sorted(dest.glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not files:
        return ""
    url = f"/api/specialists/{agent_id}/browser/shot/{files[0].name}"
    if base_url:
        url = base_url.rstrip("/") + url
    return url


def install() -> None:
    from app import computer, connectors, intent_browse
    try:
        from app import llm
        if not getattr(llm.reply, "_intent_wrapped", False):
            _reply = llm.reply
            def reply(instructions, history, **kw):
                intent_browse.remember(history)
                return _reply(instructions, history, **kw)
            reply._intent_wrapped = True
            llm.reply = reply
    except Exception:
        pass
    extra = (
        "\nSi el usuario pega una URL y dice abre, captura, computadora o entra, "
        "NO preguntes. Navegá esa URL ya. La captura viene con el navigate."
    )
    if extra not in (computer.TOOL_HINT or ""):
        computer.TOOL_HINT = (computer.TOOL_HINT or "") + extra
    if _SHOT_HINT not in (computer.TOOL_HINT or ""):
        computer.TOOL_HINT = (computer.TOOL_HINT or "") + _SHOT_HINT
    if connectors.HINT not in (computer.TOOL_HINT or ""):
        computer.TOOL_HINT = (computer.TOOL_HINT or "") + connectors.HINT

    try:
        from app.main import app
        if not getattr(app, "_connectors_on", False):
            connectors.register(app)
            app._connectors_on = True
    except Exception:
        pass

    try:
        from app import async_chat
        async_chat.install()
    except Exception:
        pass
    try:
        from app import parallel_group
        parallel_group.install()
    except Exception:
        pass

    if not getattr(computer.extract_tool, "_conn_wrapped", False):
        orig_ex = computer.extract_tool

        def extract_tool(text):
            found = orig_ex(text)
            if found:
                return found
            import re
            for m in list(re.finditer(r"```json\s*(\{.*?\})\s*```", text or "", re.S))[::-1]:
                try:
                    data = json.loads(m.group(1))
                except Exception:
                    continue
                if isinstance(data, dict) and data.get("tool") in {"github", "gmail", "browser"}:
                    return data
            return intent_browse.from_user(text)

        extract_tool._conn_wrapped = True
        computer.extract_tool = extract_tool

    if not getattr(computer.execute_tool, "_live_wrapped", False):
        orig = computer.execute_tool

        def wrapped(agent_id, agent_name=None, tool=None, is_pro=False, base_url="", **kw):
            set_live(agent_id, live_for_tool(tool or {}))
            kind = (tool or {}).get("tool")
            if kind in {"github", "gmail"}:
                try:
                    return connectors.execute(tool or {})
                except Exception as exc:
                    return "error del conector: " + str(exc)
            return orig(agent_id, agent_name, tool, is_pro=is_pro, base_url=base_url, **kw)

        wrapped._live_wrapped = True
        computer.execute_tool = wrapped
    elif not getattr(computer.execute_tool, "_conn_exec", False):
        inner = computer.execute_tool

        def wrapped(agent_id, agent_name=None, tool=None, is_pro=False, base_url="", **kw):
            kind = (tool or {}).get("tool")
            if kind in {"github", "gmail"}:
                set_live(agent_id, live_for_tool(tool or {}))
                try:
                    return connectors.execute(tool or {})
                except Exception as exc:
                    return "error del conector: " + str(exc)
            return inner(agent_id, agent_name, tool, is_pro=is_pro, base_url=base_url, **kw)

        wrapped._live_wrapped = True
        wrapped._conn_exec = True
        computer.execute_tool = wrapped

    if not getattr(computer.write, "_upload_wrapped", False):
        orig_write = computer.write

        def write(agent_id, name, body):
            if str(name).endswith(".png") and str(body).startswith("data:image"):
                return save_upload(agent_id, body)
            return orig_write(agent_id, name, body)

        write._upload_wrapped = True
        computer.write = write

    if hasattr(computer, "_browser_tool") and not getattr(computer._browser_tool, "_shot_wrapped", False):
        orig_b = computer._browser_tool

        def _browser_tool(agent_id, tool, is_pro=False, base_url=""):
            text = orig_b(agent_id, tool, is_pro=is_pro, base_url=base_url)
            act = str((tool or {}).get("action") or "").lower()
            if act in {"navigate", "screenshot"} and "![captura]" not in str(text):
                shot = _latest_shot(agent_id, base_url)
                if shot:
                    text = str(text) + " Ya hay captura: ![captura](" + shot + ")"
            return text

        _browser_tool._shot_wrapped = True
        computer._browser_tool = _browser_tool
