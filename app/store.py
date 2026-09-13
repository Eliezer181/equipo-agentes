from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SPECIALISTS_PATH = DATA / "specialists.json"
CHATS_DIR = DATA / "conversations"
GROUPS_DIR = DATA / "groups"

_lock = Lock()
COLORS = [
    "#f3ead8", "#f97316", "#38bdf8", "#34d399", "#a78bfa",
    "#fb7185", "#facc15", "#22d3ee", "#818cf8", "#fb923c",
]

DEFAULT_SPECIALISTS = [
    {
        "id": "asistente",
        "name": "Asistente",
        "title": "General",
        "color": "#f97316",
        "instructions": "Sos un asistente útil, directo y en español. Preguntá si falta contexto. No inventes datos. Si no sabés algo, decilo.",
    }
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text or "agente"


def _read_json(path: Path, default):
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def seed_defaults() -> None:
    if not SPECIALISTS_PATH.exists():
        _write_json(SPECIALISTS_PATH, DEFAULT_SPECIALISTS)


def list_specialists() -> list[dict]:
    with _lock:
        items = _read_json(SPECIALISTS_PATH, [])
    out = []
    for item in items:
        out.append({**item, **last_preview(item["id"])})
    return out


def get_specialist(specialist_id: str) -> dict | None:
    for item in list_specialists():
        if item["id"] == specialist_id:
            return item
    return None


def _next_color(items: list[dict], requested: str | None) -> str:
    if requested and requested.lower() in {c.lower() for c in COLORS}:
        return requested
    used = {str(item.get("color", "")).lower() for item in items}
    for color in COLORS:
        if color.lower() not in used:
            return color
    return COLORS[len(items) % len(COLORS)]


def create_specialist(name: str, title: str, instructions: str, color: str | None = None) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("El nombre es obligatorio")
    with _lock:
        items = _read_json(SPECIALISTS_PATH, [])
        base = slugify(name)
        specialist_id = base
        n = 2
        existing = {item["id"] for item in items}
        while specialist_id in existing:
            specialist_id = f"{base}-{n}"
            n += 1
        item = {
            "id": specialist_id,
            "name": name,
            "title": (title or "Especialista").strip(),
            "color": _next_color(items, color),
            "instructions": (instructions or "Sos un especialista útil y directo, en español.").strip(),
        }
        items.append(item)
        _write_json(SPECIALISTS_PATH, items)
    return item


def reorder_specialists(ids: list[str]) -> list[dict]:
    with _lock:
        items = _read_json(SPECIALISTS_PATH, [])
        by_id = {item["id"]: item for item in items}
        ordered = [by_id[i] for i in ids if i in by_id]
        seen = set(ids)
        ordered.extend(item for item in items if item["id"] not in seen)
        _write_json(SPECIALISTS_PATH, ordered)
    return list_specialists()


def chat_path(specialist_id: str) -> Path:
    return CHATS_DIR / f"{specialist_id}.json"


def load_messages(specialist_id: str) -> list[dict]:
    with _lock:
        return _read_json(chat_path(specialist_id), [])


def save_messages(specialist_id: str, messages: list[dict]) -> None:
    with _lock:
        _write_json(chat_path(specialist_id), messages)


def last_preview(specialist_id: str) -> dict:
    messages = load_messages(specialist_id)
    if not messages:
        return {"last_message": "Sin mensajes", "last_at": ""}
    last = messages[-1]
    text = (last.get("content") or "").strip().replace("\n", " ")
    if len(text) > 72:
        text = text[:69] + "..."
    return {"last_message": text or "Sin mensajes", "last_at": last.get("at", "")}


def group_path(group_id: str) -> Path:
    return GROUPS_DIR / f"{group_id}.json"


def list_groups() -> list[dict]:
    out: list[dict] = []
    with _lock:
        GROUPS_DIR.mkdir(parents=True, exist_ok=True)
        for path in sorted(GROUPS_DIR.glob("*.json")):
            group = _read_json(path, None)
            if not group:
                continue
            messages = group.get("messages") or []
            last = messages[-1] if messages else {}
            text = (last.get("content") or "").strip().replace("\n", " ")
            if len(text) > 72:
                text = text[:69] + "..."
            out.append({
                "id": group["id"],
                "name": group["name"],
                "task": group.get("task", ""),
                "leader": group.get("leader", ""),
                "members": [
                    {
                        "id": m["id"],
                        "name": m["name"],
                        "title": m.get("title", ""),
                        "color": m["color"],
                    }
                    for m in group.get("members", [])
                ],
                "last_message": text or "Sin mensajes",
                "last_at": last.get("at", ""),
            })
    return out


def get_group(group_id: str) -> dict | None:
    with _lock:
        return _read_json(group_path(group_id), None)


def save_group(group: dict) -> None:
    with _lock:
        _write_json(group_path(group["id"]), group)


def delete_group(group_id: str) -> bool:
    with _lock:
        path = group_path(group_id)
        if path.exists():
            path.unlink()
            return True
        return False


def create_group(name: str, task: str, leader: str, members: list[dict]) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("El nombre es obligatorio")
    with _lock:
        GROUPS_DIR.mkdir(parents=True, exist_ok=True)
        existing = {p.stem for p in GROUPS_DIR.glob("*.json")}
        base = slugify(name)
        group_id = base
        n = 2
        while group_id in existing:
            group_id = f"{base}-{n}"
            n += 1
        group = {
            "id": group_id,
            "name": name,
            "task": (task or "").strip(),
            "leader": (leader or "").strip() or "Líder",
            "members": [
                {
                    "id": m["id"],
                    "name": m["name"],
                    "title": m.get("title", ""),
                    "color": m.get("color", "#f97316"),
                    "instructions": m.get("instructions", ""),
                }
                for m in members
            ],
            "messages": [],
        }
        _write_json(group_path(group_id), group)
    return group


def remove_group_member(group_id: str, member_id: str) -> dict | None:
    group = get_group(group_id)
    if not group:
        return None
    members = [m for m in group.get("members", []) if m["id"] != member_id]
    if len(members) == len(group.get("members", [])):
        return group
    if not members:
        raise ValueError("El grupo no puede quedar vacío")
    group["members"] = members
    save_group(group)
    return group
