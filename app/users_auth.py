from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path

from app.store import DATA

USERS_PATH = DATA / "users.json"
SESSIONS_PATH = DATA / "sessions.json"
COOKIE = "ea_session"
FREE_CREDITS = float(os.getenv("FREE_USER_CREDITS", "5"))


def _read(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120_000)
    return salt, digest.hex()


def _verify(password: str, salt: str, hashed: str) -> bool:
    _, dig = _hash_password(password, salt)
    return hmac.compare_digest(dig, hashed)


def list_users() -> dict:
    return _read(USERS_PATH, {})


def save_users(users: dict) -> None:
    _write(USERS_PATH, users)


def sessions() -> dict:
    return _read(SESSIONS_PATH, {})


def save_sessions(data: dict) -> None:
    _write(SESSIONS_PATH, data)


def register(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    password = password or ""
    if "@" not in email or len(password) < 8:
        raise ValueError("Email o contraseña inválidos (mín. 8 caracteres)")
    users = list_users()
    if email in users:
        raise ValueError("Ese email ya está registrado")
    salt, hashed = _hash_password(password)
    users[email] = {
        "email": email,
        "salt": salt,
        "password_hash": hashed,
        "created_at": time.time(),
        "plan": "free",
        "payment_status": "none",
        "credits_remaining": FREE_CREDITS,
        "credits_used": 0.0,
    }
    save_users(users)
    return public_user(users[email])


def login(email: str, password: str) -> dict:
    email = (email or "").strip().lower()
    users = list_users()
    user = users.get(email)
    if not user or not _verify(password, user["salt"], user["password_hash"]):
        raise ValueError("Email o contraseña incorrectos")
    return public_user(user)


def public_user(user: dict) -> dict:
    return {
        "email": user["email"],
        "plan": user.get("plan") or "free",
        "payment_status": user.get("payment_status") or "none",
        "credits_remaining": float(user.get("credits_remaining") or 0),
        "credits_used": float(user.get("credits_used") or 0),
        "is_pro": (user.get("payment_status") == "active") or (user.get("plan") == "pro"),
    }


def create_session(email: str) -> str:
    sid = secrets.token_urlsafe(32)
    data = sessions()
    data[sid] = {"email": email, "created_at": time.time()}
    save_sessions(data)
    return sid


def destroy_session(sid: str | None) -> None:
    if not sid:
        return
    data = sessions()
    data.pop(sid, None)
    save_sessions(data)


def user_from_session(sid: str | None) -> dict | None:
    if not sid:
        return None
    data = sessions()
    row = data.get(sid)
    if not row:
        return None
    users = list_users()
    user = users.get(row.get("email"))
    if not user:
        return None
    return public_user(user)


def get_raw_user(email: str) -> dict | None:
    return list_users().get((email or "").strip().lower())


def update_user(email: str, **fields) -> dict:
    users = list_users()
    key = (email or "").strip().lower()
    if key not in users:
        raise ValueError("Usuario no encontrado")
    users[key].update(fields)
    save_users(users)
    return public_user(users[key])


def deduct_credits(email: str, amount: float) -> dict:
    users = list_users()
    key = (email or "").strip().lower()
    user = users.get(key)
    if not user:
        raise ValueError("Usuario no encontrado")
    if user.get("payment_status") == "active" or user.get("plan") == "pro":
        return public_user(user)
    amount = float(amount or 0)
    rem = max(0.0, float(user.get("credits_remaining") or 0) - amount)
    user["credits_remaining"] = rem
    user["credits_used"] = float(user.get("credits_used") or 0) + amount
    save_users(users)
    return public_user(user)


def credits_exhausted(user: dict | None) -> bool:
    return False
