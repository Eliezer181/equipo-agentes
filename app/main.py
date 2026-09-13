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


class GroupIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    task: str = Field(default="", max_length=2000)
    leader: str = Field(default="Renzo", min_length=1, max_length=60)
    members: list[str] = Field(default_factory=list)


class ReorderIn(BaseModel):
    ids: list[str]


class KickIn(BaseModel):
    member_id: str


@app.get("/health")
def health():
    return {"ok": True, "release": "v8"}


@app.get("/api/version")
def version():
    return {"release": "v8", "gemini": _using_gemini(), "models": _models()}


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
    return create_specialist(payload.name, payload.title, payload.instructions, payload.color)


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


def _group_system(member: dict, group: dict) -> str:
    mates = [m["name"] for m in group["members"] if m["id"] != member["id"]]
    mates_txt = ", ".join(mates) if mates else "nadie más por ahora"
    leader = group["leader"]
    task = group["task"] or "la que indique el líder"
    return "\n".join([
        member["instructions"],
        "",
        MEDIA_HINT,
        f'Estás en un grupo de trabajo llamado "{group["name"]}", trabajando en: {task}.',
        f"Compartís el grupo con: {mates_txt}.",
        "",
        "Reglas del grupo:",
        f"- El mensaje del usuario etiquetado como \"{leader}\" es del LÍDER del equipo: {leader}. Sus instrucciones tienen prioridad máxima.",
        f'- Si {leader} solo saluda, presentate como integrante del equipo.',
        "- Los mensajes prefijados con el nombre de otro integrante son de tus compañeros.",
        "- Respondé en español, breve y útil.",
    ])


def _group_llm_messages(member: dict, group: dict) -> list[dict]:
    out = [{"role": "system", "content": _group_system(member, group)}]
    for msg in group["messages"][-GROUP_HISTORY:]:
        content = (msg.get("content") or "").strip()
        if not content:
            continue
        if msg.get("sender") == member["name"]:
            out.append({"role": "assistant", "content": content})
        else:
            out.append({"role": "user", "content": f'{msg.get("sender", "?")}: {content}'})
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
    group.setdefault("messages", []).append({
        "sender": group["leader"],
        "role": "user",
        "content": user_text,
        "at": _now(),
    })
    replies = []
    last_error = None
    import time
    for member in group["members"]:
        text = ""
        for attempt in range(2):
            try:
                text = reply_messages(_group_llm_messages(member, group))
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
            "role": "assistant",
            "content": text,
            "at": _now(),
            "color": member.get("color", "#f97316"),
        }
        group["messages"].append(msg)
        replies.append(msg)
    save_group(group)
    if not replies:
        raise HTTPException(status_code=500, detail=str(last_error or "Nadie pudo responder"))
    return {"replies": replies, "messages": group["messages"]}
