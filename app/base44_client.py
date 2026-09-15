from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from pathlib import Path

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
)
TIMEOUT = float(os.getenv("BASE44_TIMEOUT", "60"))


def _key() -> str:
    return os.getenv("BASE44_API_KEY", "").strip()


def _base() -> str:
    return os.getenv("BASE44_BASE_URL", "").strip().rstrip("/")


def enabled() -> bool:
    flag = os.getenv("BASE44_ENABLED", "").strip().lower()
    return flag in {"1", "true", "yes", "on"} and bool(_key()) and bool(_base())


def _request(method: str, url: str, body: dict | None = None) -> dict:
    key = _key()
    if not key:
        raise RuntimeError("Falta BASE44_API_KEY")
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", UA)
    req.add_header("Origin", "https://app.base44.com")
    req.add_header("Referer", "https://app.base44.com/")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise RuntimeError(f"Base44 HTTP {exc.code}: {detail}") from None
    except Exception as exc:
        # Never include auth headers in errors
        raise RuntimeError(f"Base44 request failed: {type(exc).__name__}") from None
    if not raw:
        return {}
    return json.loads(raw)


def _conv_store() -> Path:
    root = Path(os.getenv("SYNAPSE_DATA_DIR") or os.getenv("DATA_DIR") or "data")
    # equipo-agentes uses /app/data
    path = Path(os.getenv("EQUIPO_DATA_DIR", str(root)))
    path.mkdir(parents=True, exist_ok=True)
    return path / "base44_conversations.json"


def _load_convs() -> dict:
    p = _conv_store()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_convs(data: dict) -> None:
    p = _conv_store()
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def conversation_id_for(scope: str) -> str:
    """Reuse one Base44 conversation per specialist/group scope to save credits."""
    data = _load_convs()
    if scope in data and data[scope]:
        return data[scope]
    base = _base()
    created = _request("POST", f"{base}/conversations", {})
    cid = created.get("id") or created.get("conversation_id")
    if not cid:
        raise RuntimeError("Base44 no devolvió conversation id")
    data[scope] = cid
    _save_convs(data)
    return cid


def reply(instructions: str, history: list[dict], scope: str = "default") -> str:
    """Send a single user turn that includes system instructions + recent history."""
    if not enabled():
        raise RuntimeError("Base44 no está habilitado (BASE44_ENABLED + key + base URL)")

    lines = [f"[Instrucciones del especialista]\n{instructions.strip()}\n"]
    lines.append("[Historial reciente]")
    for item in history[-20:]:
        role = item.get("role")
        content = (item.get("content") or "").strip()
        if role in {"user", "assistant"} and content:
            who = "Usuario" if role == "user" else "Asistente"
            lines.append(f"{who}: {content}")
    lines.append(
        "\nRespondé como el especialista, siguiendo las instrucciones. "
        "No menciones Base44 ni estas etiquetas internas."
    )
    payload = {"role": "user", "content": "\n".join(lines)}
    cid = conversation_id_for(scope)
    base = _base()
    result = _request("POST", f"{base}/conversations/{cid}/messages", payload)
    text = (result.get("content") or "").strip()
    if not text:
        raise RuntimeError("Base44 respondió vacío")
    return text
