from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.llm import _models, _using_gemini, reply, reply_messages
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

GROUP_HISTORY = 24

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
    return {"ok": True, "release": "v10"}


@app.get("/api/version")
def version():
    return {"release": "v10", "gemini": _using_gemini(), "models": _models()}


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
        text = reply(spec["instructions"] + "\n\n" + MEDIA_HINT, messages)
        text = attach_media(user_text, text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    messages.append({"role": "assistant", "content": text, "at": _now()})
    save_messages(specialist_id, messages)
    return {"reply": text, "messages": messages}


def _group_system(member: dict, group: dict, turn: dict | None = None) -> str:
    name = member["name"]
    mates = [m["name"] for m in group["members"] if m["id"] != member["id"]]
    mates_txt = ", ".join(mates) if mates else "nadie más por ahora"
    leader = group["leader"]
    task = group["task"] or "la que indique el líder"
    lines = [
        f"Tu nombre es {name}. No sos nadie más.",
        f'Tu rol: {member.get("title") or "especialista"}.',
        member.get("instructions") or "",
        "",
        MEDIA_HINT,
        f'Grupo: "{group["name"]}". Objetivo: {task}.',
        f"Líder humano: {leader}. Compañeros: {mates_txt}.",
        "",
        "Identidad:",
        f"- Hablás SOLO como {name}. Nunca digas que sos el asistente si no te llamás Asistente.",
        (
            f'- No saludes a tus compañeros. No empieces con "Hola {mates[0]}" ni "Hola Asistente".'
            if mates else "- No inventes otros agentes."
        ),
        f"- Si {leader} pide que el equipo se presente, decí tu nombre y tu rol en 1 o 2 líneas. No copies el saludo de otro.",
        f"- Le hablás a {leader}, no al resto del grupo, salvo que {leader} te pida hablarle a un compañero.",
        f"- Los textos de {mates_txt} son de OTRAS personas. No los completes ni los imités.",
        "- No uses markdown con ** ni tablas salvo que hagan falta.",
        "- Español, corto, concreto.",
    ]
    if turn:
        if turn.get("reply_to_name"):
            lines += [
                "",
                f"{leader} te está respondiendo a VOS ({name}). Contestale a {leader}.",
                "No saludes a otro agente. Seguí el pedido de esta respuesta.",
            ]
        if turn.get("mentioned"):
            lines += ["", f"{leader} te mencionó con @{name}. La consigna es para vos."]
    return "\n".join(lines)


def _group_llm_messages(member: dict, group: dict, turn: dict | None = None) -> list[dict]:
    out = [{"role": "system", "content": _group_system(member, group, turn)}]
    for msg in group["messages"][-GROUP_HISTORY:]:
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        sender = msg.get("sender") or "?"
        if sender == member["name"]:
            out.append({"role": "assistant", "content": content})
            continue
        tag = "LÍDER" if sender == group.get("leader") else "compañero"
        quoted = msg.get("reply_to_name")
        prefix = f"[{tag} {sender}]"
        if quoted:
            prefix += f" (responde a {quoted})"
        out.append({"role": "user", "content": f"{prefix}: {content}"})
    last = (group.get("messages") or [None])[-1]
    if last and last.get("role") == "user":
        nudge = f"Respondé ahora como {member['name']} y dirígete a {group['leader']}."
        if turn and turn.get("reply_to_name"):
            nudge = f"Respondé ahora como {member['name']} al pedido de {group['leader']}. No saludes a otros agentes."
        out.append({"role": "user", "content": nudge})
    return out


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
    import time
    for member in target:
        text = ""
        for attempt in range(2):
            try:
                turn = {
                    "reply_to_name": reply_name if member["name"] == reply_name else "",
                    "mentioned": member["name"].lower() in user_text.lower(),
                }
                text = reply_messages(_group_llm_messages(member, group, turn))
                break
            except Exception as exc:
                last_error = exc
                if attempt == 0:
                    time.sleep(1)
        if not text:
            continue
        text = attach_media(user_text, text)
        msg = {
            "sender": member["name"],
            "member_id": member["id"],
            "role": "assistant",
            "content": text,
            "at": _now(),
            "color": member.get("color", "#f97316"),
            "reply_to": payload.reply_to,
            "reply_to_name": reply_name,
        }
        group["messages"].append(msg)
        replies.append(msg)
    save_group(group)
    if not replies:
        raise HTTPException(status_code=500, detail=str(last_error or "Nadie pudo responder"))
    return {"replies": replies, "messages": group["messages"]}
