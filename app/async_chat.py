from __future__ import annotations

import threading
from collections import defaultdict, deque
from copy import deepcopy
from typing import Any

from fastapi import HTTPException, Request
from fastapi.routing import APIRoute

from app.progress import set_live
from app.store import get_specialist, load_messages, save_messages

_GUARD = threading.Lock()
_QUEUES: dict[str, deque] = defaultdict(deque)
_RUNNING: set[str] = set()


def _kick(aid: str) -> None:
    with _GUARD:
        if aid in _RUNNING:
            return
        if not _QUEUES[aid]:
            return
        job = _QUEUES[aid].popleft()
        _RUNNING.add(aid)
    threading.Thread(target=_worker, args=(aid, job), daemon=True).start()


def _worker(aid: str, job: tuple) -> None:
    try:
        _run_turn(*job)
    finally:
        with _GUARD:
            _RUNNING.discard(aid)
        _kick(aid)


def enqueue(job: tuple) -> int:
    aid = job[0]
    with _GUARD:
        _QUEUES[aid].append(job)
        waiting = len(_QUEUES[aid]) + (1 if aid in _RUNNING else 0)
    _kick(aid)
    return waiting


def _run_turn(specialist_id: str, user_text: str, provider: str | None, is_pro: bool, base_url: str, user: dict | None) -> None:
    from app import computer, users_auth
    from app.llm import LAST_PROVIDER, reply
    from app.main import IDENTITY_HINT, MEDIA_HINT, attach_media, _now

    spec = get_specialist(specialist_id)
    if not spec:
        return
    messages = load_messages(specialist_id)
    instructions = IDENTITY_HINT + "\n\n" + spec["instructions"] + "\n\n" + MEDIA_HINT + computer.TOOL_HINT
    set_live(specialist_id, "Razonando…")
    try:
        text = reply(instructions, messages, provider=provider, scope=f"specialist:{specialist_id}")
        for _round in range(8):
            tool = computer.extract_tool(text)
            if not tool:
                break
            set_live(specialist_id, "En el navegador de esta pantalla…")
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
        print(f"[async_chat] fallo en turno de {specialist_id}: {exc!r}")
        text = (
            "Se me complicó terminar esa respuesta (un problema momentáneo "
            "con el modelo). Probá de nuevo, por favor."
        )
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


def handle_chat(specialist_id: str, payload: Any, request: Request):
    from app import main, users_auth
    user = main._current_user(request)
    if user and users_auth.credits_exhausted(user):
        raise HTTPException(
            status_code=402,
            detail={"error_code": "credits_exhausted", "message": "Se agotaron tus créditos"},
        )
    spec = get_specialist(specialist_id)
    if not spec:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    user_text = str(getattr(payload, "message", None) or (payload.get("message") if isinstance(payload, dict) else "") or "").strip()
    if not user_text:
        raise HTTPException(status_code=400, detail="Mensaje vacío")
    messages = load_messages(specialist_id)
    messages.append({"role": "user", "content": user_text, "at": main._now()})
    save_messages(specialist_id, messages)
    waiting = enqueue((
        specialist_id,
        user_text,
        getattr(payload, "provider", None),
        bool(user and user.get("is_pro")),
        str(request.base_url).rstrip("/"),
        deepcopy(user) if user else None,
    ))
    if waiting > 1:
        set_live(specialist_id, f"En cola en esta pantalla ({waiting - 1})")
    else:
        set_live(specialist_id, "Razonando…")
    return {
        "ok": True,
        "pending": True,
        "queued": waiting,
        "messages": messages,
        "provider": "queued" if waiting > 1 else "working",
    }


def install() -> None:
    from app.main import ChatIn, app

    def api_chat(specialist_id: str, payload, request: Request):
        return handle_chat(specialist_id, payload, request)
    # __future__ annotations hace que ChatIn no sea resoluble desde las
    # globals del módulo: fijamos las anotaciones con los objetos reales,
    # si no FastAPI trata payload como query param (422 en producción).
    api_chat.__annotations__ = {"specialist_id": str, "payload": ChatIn, "request": Request}

    for route in list(app.router.routes):
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if path == "/api/specialists/{specialist_id}/chat" and "POST" in methods and isinstance(route, APIRoute):
            new_route = APIRoute(path, api_chat, methods=["POST"], name=route.name)
            app.router.routes.remove(route)
            app.router.routes.append(new_route)
            break
