from __future__ import annotations

import threading
from copy import deepcopy

from fastapi import HTTPException

from app.progress import set_live
from app.store import get_specialist, load_messages, save_messages

_LOCKS: dict[str, threading.Lock] = {}
_GUARD = threading.Lock()
_BUSY: set[str] = set()


def _lock(aid: str) -> threading.Lock:
    with _GUARD:
        _LOCKS.setdefault(aid, threading.Lock())
        return _LOCKS[aid]


def _run_turn(specialist_id: str, user_text: str, provider: str | None, is_pro: bool, base_url: str, user: dict | None) -> None:
    from app import computer, users_auth
    from app.llm import LAST_PROVIDER, reply
    from app.main import MEDIA_HINT, attach_media, _now

    with _lock(specialist_id):
        spec = get_specialist(specialist_id)
        if not spec:
            return
        messages = load_messages(specialist_id)
        instructions = spec["instructions"] + "\n\n" + MEDIA_HINT + computer.TOOL_HINT
        set_live(specialist_id, "Razonando…")
        try:
            text = reply(instructions, messages, provider=provider, scope=f"specialist:{specialist_id}")
            for _round in range(8):
                tool = computer.extract_tool(text)
                if not tool:
                    break
                set_live(specialist_id, "En la computadora…")
                result = computer.execute_tool(
                    specialist_id,
                    spec.get("name"),
                    tool,
                    is_pro=is_pro,
                    base_url=base_url,
                )
                messages.append({"role": "assistant", "content": text, "at": _now()})
                note = (
                    "RESULTADO DE TU COMPUTADORA:\n" + result + "\n\n"
                    + (
                        "Última ronda: usá este resultado y respondé al usuario sin más bloques JSON."
                        if _round == 7
                        else "Podés usar otra herramienta con otro bloque JSON o responder al usuario."
                    )
                )
                messages.append({"role": "user", "content": note, "at": _now()})
                text = reply(instructions, messages, provider=provider, scope=f"specialist:{specialist_id}")
            text = computer.strip_tools(text) or text
            text = attach_media(user_text, text)
        except Exception as exc:
            text = "No pude terminar el trabajo: " + str(exc)
        messages.append({"role": "assistant", "content": text, "at": _now()})
        save_messages(specialist_id, messages)
        set_live(specialist_id, "")
        provider_used = LAST_PROVIDER.get()
        if user and provider_used in {"base44", "gemini_fallback", "gemini"}:
            try:
                charge = 0.1 if provider_used != "gemini" else 0.05
                users_auth.deduct_credits(user["email"], charge)
            except Exception:
                pass
        with _GUARD:
            _BUSY.discard(specialist_id)


def install() -> None:
    from app import main, users_auth

    def api_chat(specialist_id: str, payload, request):
        user = main._current_user(request)
        if user and users_auth.credits_exhausted(user):
            raise HTTPException(
                status_code=402,
                detail={"error_code": "credits_exhausted", "message": "Se agotaron tus créditos"},
            )
        spec = get_specialist(specialist_id)
        if not spec:
            raise HTTPException(status_code=404, detail="No existe ese especialista")
        user_text = (payload.message or "").strip()
        if not user_text:
            raise HTTPException(status_code=400, detail="Mensaje vacío")
        messages = load_messages(specialist_id)
        messages.append({"role": "user", "content": user_text, "at": main._now()})
        save_messages(specialist_id, messages)
        set_live(specialist_id, "Razonando…")
        with _GUARD:
            already = specialist_id in _BUSY
            _BUSY.add(specialist_id)
        if already:
            return {"ok": True, "pending": True, "messages": messages, "provider": "queued"}
        args = (
            specialist_id,
            user_text,
            getattr(payload, "provider", None),
            bool(user and user.get("is_pro")),
            str(request.base_url).rstrip("/"),
            deepcopy(user) if user else None,
        )
        threading.Thread(target=_run_turn, args=args, daemon=True).start()
        return {"ok": True, "pending": True, "messages": messages, "provider": "working"}

    main.api_chat = api_chat
    for route in main.app.routes:
        if getattr(route, "path", "") == "/api/specialists/{specialist_id}/chat" and "POST" in getattr(route, "methods", set()):
            route.endpoint = api_chat
            if hasattr(route, "dependant"):
                try:
                    route.dependant.call = api_chat
                except Exception:
                    pass
