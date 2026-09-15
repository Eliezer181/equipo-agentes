from __future__ import annotations

import re
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

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
    return {"ok": True, "release": "v11"}


@app.get("/api/version")
def version():
    return {"release": "v11", "gemini": _using_gemini(), "models": _models()}


@app.get("/")
def home():
    return FileResponse(WEB / "index.html")


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
def api_chat(specialist_id: str, payload: ChatIn):
    spec = get_specialist(specialist_id)
    if not spec:
        raise HTTPException(status_code=404, detail="No existe ese especialista")
    messages = load_messages(specialist_id)
    user_text = payload.message.strip()
    messages.append({"role": "user", "content": user_text, "at": _now()})
    try:
        text = reply(
            spec["instructions"] + "\n\n" + MEDIA_HINT,
            messages,
            provider=payload.provider,
            scope=f"specialist:{specialist_id}",
        )
        text = attach_media(user_text, text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    messages.append({"role": "assistant", "content": text, "at": _now()})
    save_messages(specialist_id, messages)
    return {"reply": text, "messages": messages, "provider": LAST_PROVIDER.get()}


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
def api_group_chat(group_id: str, payload: ChatIn):
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
    return {"replies": replies, "messages": group["messages"]}
