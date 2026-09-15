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


def _data_dir() -> Path:
    store = Path(__file__).resolve().parent.parent / "data"
    store.mkdir(parents=True, exist_ok=True)
    return store


def runtime_config_path() -> Path:
    return _data_dir() / "base44_runtime.json"


def load_runtime() -> dict:
    p = runtime_config_path()
    if not p.exists():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_runtime(api_key: str | None = None, base_url: str | None = None, enabled: bool | None = None, workspace_id: str | None = None) -> dict:
    data = load_runtime()
    if api_key is not None:
        data["api_key"] = api_key.strip()
    if base_url is not None:
        data["base_url"] = base_url.strip().rstrip("/")
    if enabled is not None:
        data["enabled"] = bool(enabled)
    if workspace_id is not None:
        data["workspace_id"] = workspace_id.strip()
    p = runtime_config_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    # Clear conversation map so a new account starts clean conversations
    conv = p.parent / "base44_conversations.json"
    if conv.exists() and api_key is not None:
        try:
            conv.unlink()
        except Exception:
            pass
    return data


def mask_key(key: str) -> str:
    key = (key or "").strip()
    if not key:
        return ""
    if len(key) <= 8:
        return "••••"
    return f"{key[:4]}…{key[-4:]}"


def _key() -> str:
    rt = load_runtime()
    return (rt.get("api_key") or os.getenv("BASE44_API_KEY", "")).strip()


def _base() -> str:
    rt = load_runtime()
    return (rt.get("base_url") or os.getenv("BASE44_BASE_URL", "")).strip().rstrip("/")


def enabled() -> bool:
    rt = load_runtime()
    if "enabled" in rt:
        flag_on = bool(rt.get("enabled"))
    else:
        flag = os.getenv("BASE44_ENABLED", "").strip().lower()
        flag_on = flag in {"1", "true", "yes", "on"}
    return flag_on and bool(_key()) and bool(_base())


def status_public() -> dict:
    """Safe status for admin UI — never returns full key."""
    rt = load_runtime()
    key = _key()
    base = _base()
    source = "runtime" if rt.get("api_key") or rt.get("base_url") else "env"
    out = {
        "enabled": enabled(),
        "base_url": base,
        "api_key_masked": mask_key(key),
        "has_api_key": bool(key),
        "source": source,
        "runtime_enabled": rt.get("enabled"),
        "usage": usage_public(),
    }
    return out


def _request(method: str, url: str, body: dict | None = None):
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
        raise RuntimeError(f"Base44 request failed: {type(exc).__name__}") from None
    if not raw:
        return {}
    return json.loads(raw)


def _conv_store() -> Path:
    return _data_dir() / "base44_conversations.json"


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



def usage_path() -> Path:
    return _data_dir() / "base44_usage.json"


def _today() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def load_usage() -> dict:
    p = usage_path()
    if not p.exists():
        return {"total_credits": 0.0, "calls": 0, "by_day": {}, "events": []}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"total_credits": 0.0, "calls": 0, "by_day": {}, "events": []}
    except Exception:
        return {"total_credits": 0.0, "calls": 0, "by_day": {}, "events": []}


def record_usage(credits: float, scope: str = "", meta: dict | None = None) -> dict:
    data = load_usage()
    credits = float(credits or 0)
    day = _today()
    data["total_credits"] = float(data.get("total_credits") or 0) + credits
    data["calls"] = int(data.get("calls") or 0) + 1
    by_day = data.setdefault("by_day", {})
    by_day[day] = float(by_day.get(day) or 0) + credits
    events = data.setdefault("events", [])
    from datetime import datetime, timezone
    events.append({
        "at": datetime.now(timezone.utc).isoformat(),
        "credits": credits,
        "scope": scope,
        **(meta or {}),
    })
    data["events"] = events[-200:]
    usage_path().write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    return data



def workspace_id() -> str:
    rt = load_runtime()
    wid = (rt.get("workspace_id") or os.getenv("BASE44_WORKSPACE_ID", "")).strip()
    if wid:
        return wid
    # Infer from apps list (organization_id)
    try:
        apps = _request("GET", "https://app.base44.com/api/apps")
        if isinstance(apps, list) and apps:
            return str(apps[0].get("organization_id") or "").strip()
    except Exception:
        pass
    return ""


def fetch_official_balance() -> dict | None:
    """Live credits from Base44 usage-logs (same source as the billing UI)."""
    wid = workspace_id()
    if not wid or not _key():
        return None
    try:
        stats = _request(
            "GET",
            f"https://app.base44.com/api/usage-logs/stats?workspace_id={wid}",
        )
    except Exception as exc:
        return {"error": type(exc).__name__, "detail": "No se pudo leer el saldo oficial"}
    if not isinstance(stats, dict):
        return None
    daily_limit = float(stats.get("daily_limit") or 0)
    daily_usage = float(stats.get("daily_usage") or 0)
    monthly_limit = float(stats.get("message_credits_effective_limit") or stats.get("monthly_limit") or 0)
    monthly_usage = float(stats.get("monthly_usage") or 0)
    remaining = stats.get("message_credits_remaining")
    if remaining is None and monthly_limit:
        remaining = monthly_limit - monthly_usage
    return {
        "workspace_id": wid,
        "tier": stats.get("tier_display_name") or stats.get("tier"),
        "daily_usage": daily_usage,
        "daily_limit": daily_limit,
        "daily_remaining": max(0.0, round(daily_limit - daily_usage, 4)) if daily_limit else None,
        "daily_reset_at": stats.get("daily_reset_at"),
        "monthly_usage": monthly_usage,
        "monthly_limit": monthly_limit,
        "monthly_remaining": float(remaining) if remaining is not None else None,
        "extra_credits": stats.get("extra_credits"),
        "period_end": stats.get("current_credit_period_end_date"),
        "is_over_limit": bool(stats.get("is_over_limit")),
        "user_email": stats.get("user_email"),
    }


def usage_public() -> dict:
    data = load_usage()
    day = _today()
    today = float((data.get("by_day") or {}).get(day) or 0)
    total = float(data.get("total_credits") or 0)
    official = fetch_official_balance()
    out = {
        "tracked_total_credits": round(total, 4),
        "tracked_calls": int(data.get("calls") or 0),
        "tracked_today_credits": round(today, 4),
        "recent": list(reversed((data.get("events") or [])[-15:])),
        "official": official,
    }
    if official and not official.get("error"):
        out["daily_limit_ref"] = official.get("daily_limit")
        out["monthly_limit_ref"] = official.get("monthly_limit")
        out["estimated_daily_remaining"] = official.get("daily_remaining")
        out["estimated_monthly_remaining"] = official.get("monthly_remaining")
        out["note"] = "Saldo oficial de Base44 (usage-logs) + consumo de esta app abajo."
    else:
        daily_limit = float(os.getenv("BASE44_DAILY_LIMIT", "5") or 5)
        monthly_limit = float(os.getenv("BASE44_MONTHLY_LIMIT", "25") or 25)
        out["daily_limit_ref"] = daily_limit
        out["monthly_limit_ref"] = monthly_limit
        out["estimated_daily_remaining"] = max(0.0, round(daily_limit - today, 4))
        out["estimated_monthly_remaining"] = max(0.0, round(monthly_limit - total, 4))
        out["note"] = "Solo consumo de esta app (no se pudo leer el saldo oficial)."
    return out


def extract_credits(result: dict) -> float:
    usage = result.get("usage") if isinstance(result, dict) else None
    if isinstance(usage, dict) and usage.get("credits_charged") is not None:
        try:
            return float(usage.get("credits_charged") or 0)
        except Exception:
            return 0.0
    return 0.0


def reply(instructions: str, history: list[dict], scope: str = "default") -> str:
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
    text = (
        result.get("content")
        or (result.get("message") or {}).get("content")
        or ""
    ).strip()
    if not text and isinstance(result.get("messages"), list) and result["messages"]:
        text = (result["messages"][-1].get("content") or "").strip()
    if not text:
        raise RuntimeError("Base44 respondió vacío")
    charged = extract_credits(result)
    try:
        record_usage(charged, scope=scope)
    except Exception:
        pass
    return text
