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

_lock = Lock()
COLORS = ["#f97316", "#f59e0b", "#38bdf8", "#34d399", "#a78bfa", "#f472b6", "#fb7185"]


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


def list_specialists() -> list[dict]:
    with _lock:
        items = _read_json(SPECIALISTS_PATH, [])
    chats = {item["id"]: last_preview(item["id"]) for item in items}
    out = []
    for item in items:
        preview = chats.get(item["id"]) or {}
        out.append({**item, **preview})
    return out


def get_specialist(specialist_id: str) -> dict | None:
    for item in list_specialists():
        if item["id"] == specialist_id:
            return item
    return None


def create_specialist(name: str, title: str, instructions: str) -> dict:
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
            "color": COLORS[len(items) % len(COLORS)],
            "instructions": (instructions or "Sos un especialista útil y directo, en español.").strip(),
        }
        items.append(item)
        _write_json(SPECIALISTS_PATH, items)
    return item


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
