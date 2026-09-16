from __future__ import annotations

import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app import base44_client, billing, browsers, computer, users_auth
from app.llm import LAST_PROVIDER, _models, _using_gemini, reply, reply_messages_routed
from contextvars import ContextVar
from app.media import attach_media
from app.store import (
    _now,
    add_group_member,
    clear_messages,
    create_group,
    create_specialist,
    delete_group,
    delete_specialist,
    get_group,
    get_specialist,
    list_groups,
    list_specialists,
    load_messages,
    remove_group_member,
    reorder_specialists,
    save_group,
    save_messages,
    seed_defaults,
    set_archived,
    update_specialist,
)

load_dotenv()
seed_defaults()

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"

app = FastAPI(title="Equipo de agentes")
app.mount("/static", StaticFiles(directory=WEB), name="static")

GROUP_HISTORY = 12
_PROVIDER: ContextVar[str | None] = ContextVar("llm_provider", default=None)

MEDIA_HINT = (
    "Si te piden una foto, imagen o enlace, incluí una URL http real "
    "con markdown: ![descripción](https://...). No inventes sitios."
)


class SpecialistIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    title: str = Field(default="Especialista", max_length=40)
    instructions: str = Field(default="", max_length=4000)
    color: str | None = Field(default=None, max_length=16)


class SpecialistPatch(BaseModel):
    name: str | None = Field(default=None, max_length=40)
    title: str | None = Field(default=None, max_length=40)
    instructions: str | None = Field(default=None, max_length=4000)
    color: str | None = Field(default=None, max_length=16)


class ArchiveIn(BaseModel):
    archived: bool = True


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    reply_to: str | None = None
    # Optional: "gemini" (default) or "base44" for heavy turns. Needs BASE44_* secrets.
    provider: str | None = Field(default=None, max_length=16)


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    task: str = Field(default="", max_length=2000)
    leader: str = Field(default="Renzo", min_length=1, max_length=60)
    members: list[str] = Field(default_factory=list)


class ReorderIn(BaseModel):
    ids: list[str]


class ComputerFileIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    body: str = Field(default="", max_length=200_000)


class ComputerExecIn(BaseModel):
    cmd: str = Field(min_length=1, max_length=4000)


class BrowserActionIn(BaseModel):
    do: str = Field(default="navigate")  # start|stop|navigate|click|type|scroll|back|read|click_xy|type_focused|key
    url: str = ""
    selector: str = ""
    text: str = ""
    x: float | None = None
    y: float | None = None


class ComputerFetchIn(BaseModel):
    url: str = Field(min_length=4, max_length=500)


class KickIn(BaseModel):
    member_id: str


def mentioned_members(text: str, members: list[dict]) -> list[dict]:
    low = (text or "").lower()
    hits = []
    for member in sorted(members, key=lambda m: -len(m.get("name") or "")):
        name = (member.get("name") or "").strip()
        if name and f"@{name.lower()}" in low:
            hits.append(member)
    return hits


def speakers_for(group: dict, payload: ChatIn) -> list[dict]:
    members = list(group.get("members") or [])
    if payload.reply_to:
        picked = [
            m for m in members
            if m.get("id") == payload.reply_to or (m.get("name") or "").lower() == payload.reply_to.lower()
        ]
        if picked:
            return picked
    tagged = mentioned_members(payload.message, members)
    return tagged or members


@app.get("/health")
def health():
    return {"ok": True, "release": "v14"}


@app.get("/api/version")
def version():
    return {"release": "v14", "gemini": _using_gemini(), "models": _models(), "computer": True}


@app.get("/")
def home(request: Request):
    sid = request.cookies.get(users_auth.COOKIE)
    user = users_auth.user_from_session(sid)
    if user:
        return FileResponse(WEB / "index.html")
    return RedirectResponse(url="/landing", status_code=302)


@app.get("/landing")
def landing_page():
    return FileResponse(WEB / "landing.html")


@app.get("/registro")
@app.get("/login")
def auth_page():
    return FileResponse(WEB / "auth.html")


@app.get("/paywall")
def paywall_page():
    return FileResponse(WEB / "paywall.html")


def _current_user(request: Request) -> dict | None:
    return users_auth.user_from_session(request.cookies.get(users_auth.COOKIE))


def _require_user(request: Request) -> dict:
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Tenés que iniciar sesión")
    return user


def _set_session_cookie(response: Response, sid: str) -> None:
    secure = True  # Fly serves HTTPS
    response.set_cookie(
        users_auth.COOKIE,
        sid,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=60 * 60 * 24 * 30,
        path="/",
    )


class AuthIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=8, max_length=200)


@app.post("/api/auth/register")
def api_register(payload: AuthIn, response: Response):
    try:
        user = users_auth.register(payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    sid = users_auth.create_session(user["email"])
    _set_session_cookie(response, sid)
    return {"ok": True, "user": user}


@app.post("/api/auth/login")
def api_login(payload: AuthIn, response: Response):
    try:
        user = users_auth.login(payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    sid = users_auth.create_session(user["email"])
    _set_session_cookie(response, sid)
    return {"ok": True, "user": user}


@app.post("/api/auth/logout")
def api_logout(request: Request, response: Response):
    users_auth.destroy_session(request.cookies.get(users_auth.COOKIE))
    response.delete_cookie(users_auth.COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def api_me(request: Request):
    user = _current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Sin sesión")
    return user


@app.get("/api/billing/config")
def api_billing_config(request: Request):
    user = _current_user(request)
    cfg = billing.config_for(user)
    if not cfg.get("usdt_address"):
        raise HTTPException(status_code=503, detail="Dirección USDT no configurada")
    return cfg


@app.post("/api/billing/mark-paid")
def api_billing_mark_paid(request: Request):
    user = _require_user(request)
    updated = users_auth.update_user(user["email"], payment_status="pending")
    return {"ok": True, "user": updated, "payment_status": "pending"}


@app.get("/avatares")
def avatares():
    return FileResponse(WEB / "avatares.html")


@app.get("/api/specialists")
def api_list():
    return list_specialists()


@app.post("/api/specialists")
def api_create(payload: SpecialistIn):
    try:
        return create_specialist(payload.name, payload.title, payload.instructions, payload.color)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/specialists/{specialist_id}")
def api_update(specialist_id: str, payload: SpecialistPatch):
    try:
        item = update_specialist(specialist_id, payload.name, payload.title, payload.instructions, payload.color)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not item:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    return item


@app.post("/api/specialists/{specialist_id}/archive")
def api_archive(specialist_id: str, payload: ArchiveIn):
    item = set_archived(specialist_id, payload.archived)
    if not item:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    return item


@app.delete("/api/specialists/{specialist_id}")
def api_delete(specialist_id: str):
    if not delete_specialist(specialist_id):
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    return {"ok": True}


@app.delete("/api/specialists/{specialist_id}/messages")
def api_clear(specialist_id: str):
    if not clear_messages(specialist_id):
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    return {"ok": True, "messages": []}


@app.post("/api/specialists/reorder")
def api_reorder(payload: ReorderIn):
    return reorder_specialists(payload.ids)


@app.get("/api/specialists/{specialist_id}/messages")
def api_messages(specialist_id: str):
    if not get_specialist(specialist_id):
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    return load_messages(specialist_id)


@app.post("/api/specialists/{specialist_id}/chat")
def api_chat(specialist_id: str, payload: ChatIn, request: Request):
    user = _current_user(request)
    if user and users_auth.credits_exhausted(user):
        raise HTTPException(
            status_code=402,
            detail={"error_code": "credits_exhausted", "message": "Se agotaron tus créditos"},
        )
    spec = get_specialist(specialist_id)
    if not spec:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    messages = load_messages(specialist_id)
    user_text = payload.message.strip()
    messages.append({"role": "user", "content": user_text, "at": _now()})
    instructions = spec["instructions"] + "\n\n" + MEDIA_HINT + computer.TOOL_HINT
    try:
        text = reply(
            instructions,
            messages,
            provider=payload.provider,
            scope=f"specialist:{specialist_id}",
        )
        # Loop de herramientas: el agente puede usar SU computadora
        # (bash, python, archivos, fetch). Máx 3 rondas por mensaje.
        for _round in range(3):
            tool = computer.extract_tool(text)
            if not tool:
                break
            result = computer.execute_tool(specialist_id, spec.get("name"), tool, is_pro=bool(user and user.get("is_pro")))
            messages.append({"role": "assistant", "content": text, "at": _now()})
            note = (
                "RESULTADO DE TU COMPUTADORA:\n" + result + "\n\n"
                + ("Última ronda: usá este resultado y respondé al usuario sin más bloques JSON."
                   if _round == 2 else
                   "Podés usar otra herramienta con otro bloque JSON o responder al usuario.")
            )
            messages.append({"role": "user", "content": note, "at": _now()})
            try:
                text = reply(
                    instructions,
                    messages,
                    provider=payload.provider,
                    scope=f"specialist:{specialist_id}",
                )
            except Exception as exc:
                raise HTTPException(status_code=500, detail=str(exc)) from exc
        text = computer.strip_tools(text) or text
        text = attach_media(user_text, text)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    messages.append({"role": "assistant", "content": text, "at": _now()})
    save_messages(specialist_id, messages)
    provider_used = LAST_PROVIDER.get()
    if user and provider_used in {"base44", "gemini_fallback", "gemini"}:
        # Free users: count Base44 charges; gemini path still counts a small unit to exhaust freemium
        try:
            charge = 0.1 if provider_used != "gemini" else 0.05
            users_auth.deduct_credits(user["email"], charge)
        except Exception:
            pass
    return {"reply": text, "messages": messages, "provider": provider_used}


def _clean_reply(text: str, name: str, other_names: list[str] | None = None) -> str:
    """Limpia la respuesta y corrige que el agente se identifique como otro.

    Antes solo se filtraba la frase "soy el asistente" cuando el agente no se
    llamaba Asistente. Ahora se generaliza a CUALQUIER compañero del grupo, y
    también se cubre la palabra genérica "asistente" cuando ese no es el
    nombre real del agente (causa más común de confusión: un agente llamado
    Juan diciendo "soy el asistente del equipo" porque usó la palabra como
    sustantivo común, no como nombre propio)."""
    out = (text or "").strip().replace("**", "")
    guard = {n.strip().lower() for n in (other_names or []) if n.strip()}
    guard.discard(name.strip().lower())
    if name.strip().lower() != "asistente":
        guard.add("asistente")
    if guard:
        pattern = re.compile(
            r"\bsoy\s+(el\s+|la\s+)?(" + "|".join(re.escape(w) for w in guard) + r")\b",
            re.IGNORECASE,
        )
        lines = [ln for ln in out.splitlines() if not pattern.search(ln)]
        out = "\n".join(lines).strip()
    return out or f"Soy {name}."


def _group_system(member: dict, group: dict, turn: dict | None = None) -> str:
    name = member["name"]
    role = member.get("title") or "especialista"
    mates = [m["name"] for m in group["members"] if m["id"] != member["id"]]
    mates_txt = ", ".join(mates) if mates else "nadie más"
    leader = group["leader"]
    task = group["task"] or "lo que pida el líder"
    forbidden = ", ".join(mates) if mates else "ningún otro nombre"
    self_word_guard = (
        None
        if name.strip().lower() == "asistente"
        else (
            f"Nunca digas 'soy el asistente' ni uses la palabra 'asistente' para "
            f"hablar de vos mismo: tu nombre es {name}, usá siempre ese nombre "
            "propio, aunque tu rol sea ayudar."
        )
    )
    lines = [
        f"SOS {name} y SOLO {name}. Rol: {role}. Tu identidad no cambia nunca en esta conversación, sin importar quién te escriba.",
        f"Prohibido decir que sos otra persona.",
        f"Prohibido presentarte como {forbidden} o usar sus nombres para hablar de vos." if mates else "",
        self_word_guard,
        member.get("instructions") or "",
        "",
        f'Grupo "{group["name"]}". Tarea: {task}.',
        f"El humano se llama {leader}. Tus compañeros: {mates_txt}.",
        "",
        "Cómo hablar:",
        f"- Todo lo que escribas es de {name}, en primera persona.",
        f"- Si te pedís presentar, empezá con: Soy {name}, {role}.",
        f"- Le hablás a {leader}, excepto si te pide saludar o responderle a un compañero.",
        "- Si un compañero te nombra con @, contestale a ese compañero, breve.",
        "- No copies el mensaje de otro. No uses **.",
        "- Máximo 4 frases.",
    ]
    turn = turn or {}
    if turn.get("address"):
        lines += ["", f"En este turno hablale a {turn['address']}."]
    if turn.get("task"):
        lines += ["", f"Consigna de este turno: {turn['task']}"]
    return "\n".join(ln for ln in lines if ln is not None)


def _transcript(member: dict, group: dict) -> str:
    rows = []
    for msg in group.get("messages", [])[-GROUP_HISTORY:]:
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        sender = msg.get("sender") or "?"
        mine = " (vos)" if sender == member["name"] else ""
        rows.append(f"{sender}{mine}: {content}")
    return "\n".join(rows) if rows else "(sin historial)"


def _group_llm_messages(member: dict, group: dict, turn: dict | None = None) -> list[dict]:
    name = member["name"]
    leader = group["leader"]
    last = (group.get("messages") or [{}])[-1]
    last_line = f"{last.get('sender', leader)}: {last.get('content', '')}"
    user = "\n".join([
        "Chat reciente:",
        _transcript(member, group),
        "",
        f"Último mensaje: {last_line}",
        f"Escribí la respuesta de {name} ahora. No digas que sos otra persona.",
    ])
    return [
        {"role": "system", "content": _group_system(member, group, turn)},
        {"role": "user", "content": user},
    ]


def _speak(member: dict, group: dict, turn: dict | None = None) -> str:
    import time
    last_error = None
    other_names = [m["name"] for m in group.get("members", []) if m["id"] != member["id"]]
    for attempt in range(2):
        try:
            # Temperatura baja en chats grupales: menos creatividad, más apego
            # a las instrucciones de identidad (evita que un agente "derive"
            # hacia el nombre o el rol de otro compañero).
            text = reply_messages_routed(
                _group_llm_messages(member, group, turn),
                temperature=0.2,
                provider=_PROVIDER.get(),
                scope=f"group:{group.get('id', 'unknown')}:{member['id']}",
            )
            return _clean_reply(text, member["name"], other_names)
        except Exception as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(1)
    if last_error:
        raise last_error
    return ""



# ---------------------------------------------------------------------------
# Computadora propia de cada agente (escritorio real, persistente en /app/data)
# ---------------------------------------------------------------------------

def _spec_or_404(specialist_id: str) -> dict:
    spec = get_specialist(specialist_id)
    if not spec:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    return spec


@app.get("/api/specialists/{specialist_id}/computer")
def api_computer_state(specialist_id: str):
    spec = _spec_or_404(specialist_id)
    try:
        return {"agent": spec["name"], "files": computer.ls(specialist_id, spec.get("name"))}
    except computer.ComputerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/specialists/{specialist_id}/computer/files")
def api_computer_write(specialist_id: str, payload: ComputerFileIn):
    spec = _spec_or_404(specialist_id)
    try:
        return computer.write(specialist_id, payload.name, payload.body)
    except computer.ComputerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/specialists/{specialist_id}/computer/files/{name}")
def api_computer_read(specialist_id: str, name: str):
    _spec_or_404(specialist_id)
    try:
        return {"name": name, "body": computer.read(specialist_id, name)}
    except computer.ComputerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/api/specialists/{specialist_id}/computer/files/{name}")
def api_computer_delete(specialist_id: str, name: str):
    _spec_or_404(specialist_id)
    try:
        return computer.delete(specialist_id, name)
    except computer.ComputerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/specialists/{specialist_id}/computer/exec")
def api_computer_exec(specialist_id: str, payload: ComputerExecIn):
    _spec_or_404(specialist_id)
    try:
        return computer.run(specialist_id, payload.cmd)
    except computer.ComputerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/specialists/{specialist_id}/computer/fetch")
def api_computer_fetch(specialist_id: str, payload: ComputerFetchIn):
    _spec_or_404(specialist_id)
    try:
        return computer.fetch(payload.url)
    except computer.ComputerError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/specialists/{specialist_id}/browser")
def api_browser_status(specialist_id: str):
    """Estado del Chrome real del especialista (y URL de vista en vivo)."""
    _spec_or_404(specialist_id)
    try:
        return browsers.status(specialist_id)
    except browsers.BrowserError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/specialists/{specialist_id}/browser")
def api_browser(specialist_id: str, payload: BrowserActionIn, request: Request):
    """Enciende/apaga/maneja el Chrome real en la nube."""
    _spec_or_404(specialist_id)
    do = payload.do.strip().lower()
    user = _current_user(request)
    is_pro = bool(user and user.get("is_pro"))
    try:
        if do == "start":
            return browsers.start(specialist_id, is_pro=is_pro)
        if do == "stop":
            return browsers.stop(specialist_id)
        return browsers.action(specialist_id, do, url=payload.url,
                               selector=payload.selector, text=payload.text,
                               x=payload.x, y=payload.y)
    except browsers.PremiumRequired as exc:
        raise HTTPException(status_code=402, detail=str(exc)) from exc
    except browsers.BrowserError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/specialists/{specialist_id}/computer/proxy")
def api_computer_proxy(specialist_id: str, url: str):
    """Navegador del escritorio: sirve la página completa para el iframe."""
    _spec_or_404(specialist_id)
    try:
        raw, ctype = computer.proxy_page(url)
        return Response(content=raw, media_type=ctype)
    except computer.ComputerError as exc:
        return Response(
            content=f"<!doctype html><p style='font-family:sans-serif;padding:20px;color:#8e8e93'>{exc}</p>",
            media_type="text/html; charset=utf-8",
            status_code=400,
        )

@app.get("/api/groups")
def api_groups_list():
    return list_groups()


@app.post("/api/groups")
def api_groups_create(payload: GroupIn):
    specs = []
    for sid in payload.members:
        spec = get_specialist(sid)
        if not spec:
            raise HTTPException(status_code=404, detail=f"No existe el especialista {sid}")
        specs.append(spec)
    if not specs:
        raise HTTPException(status_code=400, detail="Elegí al menos un especialista")
    return create_group(payload.name, payload.task, payload.leader, specs)


@app.get("/api/groups/{group_id}/messages")
def api_group_messages(group_id: str):
    group = get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="No existe ese grupo")
    return group.get("messages", [])


@app.post("/api/groups/{group_id}/members")
def api_group_add(group_id: str, payload: KickIn):
    spec = get_specialist(payload.member_id)
    if not spec:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    group = add_group_member(group_id, spec)
    if group is None:
        raise HTTPException(status_code=404, detail="No existe ese grupo")
    return group


@app.post("/api/groups/{group_id}/kick")
def api_group_kick(group_id: str, payload: KickIn):
    try:
        group = remove_group_member(group_id, payload.member_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if group is None:
        raise HTTPException(status_code=404, detail="No existe ese grupo")
    return group


@app.delete("/api/groups/{group_id}")
def api_group_delete(group_id: str):
    if not delete_group(group_id):
        raise HTTPException(status_code=404, detail="No existe ese grupo")
    return {"ok": True}


@app.post("/api/groups/{group_id}/chat")
def api_group_chat(group_id: str, payload: ChatIn, request: Request):
    user = _current_user(request)
    if user and users_auth.credits_exhausted(user):
        raise HTTPException(
            status_code=402,
            detail={"error_code": "credits_exhausted", "message": "Se agotaron tus créditos"},
        )
    group = get_group(group_id)
    if not group:
        raise HTTPException(status_code=404, detail="No existe ese grupo")
    if not group.get("members"):
        raise HTTPException(status_code=400, detail="El grupo no tiene integrantes")
    _PROVIDER.set(payload.provider)
    user_text = payload.message.strip()
    target = speakers_for(group, payload)
    reply_name = target[0]["name"] if payload.reply_to and target else ""
    group.setdefault("messages", []).append({
        "sender": group["leader"],
        "role": "user",
        "content": user_text,
        "at": _now(),
        "reply_to": payload.reply_to,
        "reply_to_name": reply_name,
    })
    replies = []
    last_error = None
    spoken: set[str] = set()

    def add_reply(member: dict, turn: dict, quote_name: str = "") -> str:
        nonlocal last_error
        try:
            text = _speak(member, group, turn)
        except Exception as exc:
            last_error = exc
            return ""
        if not text:
            return ""
        text = attach_media(user_text, text)
        msg = {
            "sender": member["name"],
            "member_id": member["id"],
            "role": "assistant",
            "content": text,
            "at": _now(),
            "color": member.get("color", "#f97316"),
            "reply_to": member["id"],
            "reply_to_name": quote_name,
        }
        group["messages"].append(msg)
        replies.append(msg)
        spoken.add(member["id"])
        return text

    for member in target:
        turn = {"task": user_text, "address": group["leader"]}
        if payload.reply_to and member["name"] == reply_name:
            turn["task"] = f"{group['leader']} te respondió: {user_text}"
        add_reply(member, turn, reply_name)

    pending = []
    snapshot = list(replies)
    for msg in snapshot:
        for other in group["members"]:
            if other["id"] in spoken:
                continue
            if f"@{other['name'].lower()}" in (msg.get("content") or "").lower():
                pending.append((other, msg["sender"]))
    for other, who in pending:
        if other["id"] in spoken:
            continue
        add_reply(other, {
            "task": f"{who} te habló. Respondéle a {who}.",
            "address": who,
        }, who)

    save_group(group)
    if not replies:
        raise HTTPException(status_code=500, detail=str(last_error or "Nadie pudo responder"))
    provider_used = LAST_PROVIDER.get()
    if user:
        try:
            # one unit per reply roughly
            charge = 0.1 * max(1, len(replies))
            users_auth.deduct_credits(user["email"], charge)
        except Exception:
            pass
    return {"replies": replies, "messages": group["messages"], "provider": provider_used}


def _require_admin(request: Request) -> None:
    import os
    expected = (os.getenv("ADMIN_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="ADMIN_TOKEN no configurado en el servidor")
    got = (request.headers.get("X-Admin-Token") or "").strip()
    if not got or got != expected:
        raise HTTPException(status_code=401, detail="Clave de admin incorrecta")


class Base44AdminIn(BaseModel):
    api_key: str | None = Field(default=None, max_length=500)
    base_url: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None


@app.get("/admin/base44")
def admin_base44_page():
    path = WEB / "admin-base44.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Falta admin-base44.html")
    return FileResponse(path)


@app.get("/api/admin/base44")
def api_admin_base44_get(request: Request):
    _require_admin(request)
    return base44_client.status_public()


@app.get("/api/admin/base44/usage")
def api_admin_base44_usage(request: Request):
    _require_admin(request)
    return base44_client.usage_public()


@app.put("/api/admin/base44")
def api_admin_base44_put(payload: Base44AdminIn, request: Request):
    _require_admin(request)
    key = (payload.api_key or "").strip() or None
    url = (payload.base_url or "").strip() or None
    if key is None and url is None and payload.enabled is None:
        raise HTTPException(status_code=400, detail="Nada para guardar")
    base44_client.save_runtime(api_key=key, base_url=url, enabled=payload.enabled)
    return base44_client.status_public()


@app.delete("/api/admin/base44")
def api_admin_base44_delete(request: Request):
    _require_admin(request)
    path = base44_client.runtime_config_path()
    if path.exists():
        path.unlink()
    conv = path.parent / "base44_conversations.json"
    if conv.exists():
        try:
            conv.unlink()
        except Exception:
            pass
    return base44_client.status_public()



@app.post("/api/admin/billing/approve")
def api_admin_approve(request: Request, payload: dict):
    _require_admin(request)
    email = (payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Falta email")
    try:
        user = users_auth.update_user(email, payment_status="active", plan="pro")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"ok": True, "user": user}


@app.get("/api/admin/billing/pending")
def api_admin_pending(request: Request):
    _require_admin(request)
    users = users_auth.list_users()
    pending = [
        users_auth.public_user(u)
        for u in users.values()
        if u.get("payment_status") == "pending"
    ]
    return {"pending": pending}
