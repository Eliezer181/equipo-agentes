from __future__ import annotations

import email as email_lib
import imaplib
import json
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from email.mime.text import MIMEText
from pathlib import Path

from app.store import DATA

STORE = DATA / "connectors.json"

CATALOG = [
    {"id": "github", "name": "GitHub", "blurb": "Repos, issues y pull requests.", "ready": True,
     "fields": [{"key": "token", "label": "Personal Access Token", "type": "password", "hint": "github.com/settings/tokens"}]},
    {"id": "gmail", "name": "Gmail", "blurb": "Leer bandeja y mandar mails.", "ready": True,
     "fields": [
         {"key": "email", "label": "Email", "type": "email"},
         {"key": "app_password", "label": "Contraseña de aplicación", "type": "password",
          "hint": "Cuenta Google → Seguridad → Contraseñas de aplicaciones"},
     ]},
    {"id": "slack", "name": "Slack", "blurb": "Canales y mensajes del equipo.", "ready": False},
    {"id": "discord", "name": "Discord", "blurb": "Servidores y avisos.", "ready": False},
    {"id": "whatsapp", "name": "WhatsApp Business", "blurb": "Chats y avisos al celular.", "ready": False},
    {"id": "telegram", "name": "Telegram", "blurb": "Bots y grupos.", "ready": False},
    {"id": "notion", "name": "Notion", "blurb": "Notas y bases del proyecto.", "ready": False},
    {"id": "gcalendar", "name": "Google Calendar", "blurb": "Agenda y recordatorios.", "ready": False},
    {"id": "gdrive", "name": "Google Drive", "blurb": "Archivos en la nube.", "ready": False},
    {"id": "gsheets", "name": "Google Sheets", "blurb": "Planillas que el agente edita.", "ready": False},
    {"id": "outlook", "name": "Outlook", "blurb": "Mail y calendario Microsoft.", "ready": False},
    {"id": "stripe", "name": "Stripe", "blurb": "Cobros y suscripciones.", "ready": False},
    {"id": "mercadopago", "name": "Mercado Pago", "blurb": "Pagos en LATAM.", "ready": False},
    {"id": "linkedin", "name": "LinkedIn", "blurb": "Perfil y outreach.", "ready": False},
    {"id": "x", "name": "X", "blurb": "Publicar y leer el feed.", "ready": False},
    {"id": "instagram", "name": "Instagram", "blurb": "Publicaciones y bandeja.", "ready": False},
    {"id": "youtube", "name": "YouTube", "blurb": "Videos y comentarios.", "ready": False},
    {"id": "dropbox", "name": "Dropbox", "blurb": "Archivos sincronizados.", "ready": False},
    {"id": "trello", "name": "Trello", "blurb": "Tableros y tarjetas.", "ready": False},
    {"id": "linear", "name": "Linear", "blurb": "Issues de producto.", "ready": False},
    {"id": "hubspot", "name": "HubSpot", "blurb": "CRM y contactos.", "ready": False},
    {"id": "shopify", "name": "Shopify", "blurb": "Tienda y órdenes.", "ready": False},
]

HINT = (
    "\n## Conectores\n"
    "Si el usuario conectó GitHub o Gmail, usalos. No pidas el token en el chat.\n"
    'GitHub: {"tool":"github","action":"me|repos|issues|create_issue|search",'
    '"repo":"dueño/repo","title":"…","body":"…","q":"…"}\n'
    'Gmail: {"tool":"gmail","action":"inbox|send","to":"mail@x.com",'
    '"subject":"…","body":"…"}\n'
    "Si no está conectado, decile que abra Conectores en Glou (el círculo de la home)."
)


def _load() -> dict:
    if not STORE.exists():
        return {}
    try:
        data = json.loads(STORE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save(data: dict) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _mask(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if "@" in value:
        name, _, rest = value.partition("@")
        return (name[:2] + "…@" + rest) if name else value
    if len(value) <= 8:
        return "••••"
    return value[:4] + "…" + value[-4:]


def public_status() -> list[dict]:
    stored = _load()
    out = []
    for item in CATALOG:
        row = dict(item)
        saved = stored.get(item["id"]) or {}
        row["connected"] = bool(saved.get("connected"))
        row["masked"] = {k: _mask(str(v)) for k, v in saved.items() if k != "connected" and v}
        out.append(row)
    return out


def connect(kind: str, payload: dict) -> dict:
    kind = (kind or "").strip().lower()
    if kind not in {"github", "gmail"}:
        raise ValueError("ese conector todavía no está listo")
    data = _load()
    if kind == "github":
        token = str(payload.get("token") or "").strip()
        if not token:
            raise ValueError("falta el token de GitHub")
        me = _gh(token, "/user")
        data["github"] = {"connected": True, "token": token, "login": me.get("login") or ""}
    else:
        addr = str(payload.get("email") or "").strip()
        pw = str(payload.get("app_password") or "").replace(" ", "")
        if "@" not in addr or not pw:
            raise ValueError("hace falta email y contraseña de aplicación")
        _smtp_check(addr, pw)
        data["gmail"] = {"connected": True, "email": addr, "app_password": pw}
    _save(data)
    return {"ok": True, "id": kind}


def disconnect(kind: str) -> dict:
    data = _load()
    data.pop((kind or "").strip().lower(), None)
    _save(data)
    return {"ok": True}


def _gh(token: str, path: str, method: str = "GET", body: dict | None = None) -> dict | list:
    req = urllib.request.Request(
        "https://api.github.com" + path,
        data=None if body is None else json.dumps(body).encode("utf-8"),
        method=method,
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/vnd.github+json",
            "User-Agent": "Glou-Agent",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read() or b"{}"
            return json.loads(raw.decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "ignore")[:240]
        raise RuntimeError(f"GitHub {exc.code}: {detail}") from exc


def _smtp_check(addr: str, pw: str) -> None:
    with smtplib.SMTP("smtp.gmail.com", 587, timeout=20) as smtp:
        smtp.starttls()
        smtp.login(addr, pw)


def execute(tool: dict) -> str:
    kind = str((tool or {}).get("tool") or "").lower()
    act = str((tool or {}).get("action") or "").lower()
    stored = _load()
    if kind == "github":
        cfg = stored.get("github") or {}
        token = str(cfg.get("token") or "")
        if not token:
            return "GitHub no está conectado. Pedile al usuario que lo conecte en Conectores."
        if act in {"", "me", "whoami"}:
            me = _gh(token, "/user")
            return f"GitHub conectado como {me.get('login')} ({me.get('html_url')})"
        if act == "repos":
            rows = _gh(token, "/user/repos?per_page=20&sort=updated")
            if not isinstance(rows, list):
                return str(rows)[:800]
            return "repos:\n" + "\n".join(
                f"- {r.get('full_name')} · {r.get('html_url')}" for r in rows[:20]
            ) or "sin repos"
        if act == "issues":
            repo = str(tool.get("repo") or "").strip()
            if "/" not in repo:
                return "pasá repo como dueño/nombre"
            rows = _gh(token, f"/repos/{repo}/issues?state=open&per_page=15")
            if not isinstance(rows, list):
                return str(rows)[:800]
            lines = [f"- #{i.get('number')} {i.get('title')}" for i in rows if not i.get("pull_request")]
            return f"issues abiertos de {repo}:\n" + ("\n".join(lines) or "ninguno")
        if act == "create_issue":
            repo = str(tool.get("repo") or "").strip()
            title = str(tool.get("title") or "").strip()
            if "/" not in repo or not title:
                return "hace falta repo (dueño/nombre) y title"
            created = _gh(token, f"/repos/{repo}/issues", "POST", {
                "title": title,
                "body": str(tool.get("body") or ""),
            })
            return f"issue creado: #{created.get('number')} {created.get('html_url')}"
        if act == "search":
            q = str(tool.get("q") or tool.get("text") or "").strip()
            if not q:
                return "falta q"
            data = _gh(token, "/search/repositories?per_page=8&q=" + urllib.parse.quote(q))
            items = data.get("items") if isinstance(data, dict) else []
            return "búsqueda:\n" + "\n".join(
                f"- {i.get('full_name')} · {i.get('html_url')}" for i in items
            )
        return "acción de GitHub desconocida (me|repos|issues|create_issue|search)"
    if kind == "gmail":
        cfg = stored.get("gmail") or {}
        addr = str(cfg.get("email") or "")
        pw = str(cfg.get("app_password") or "")
        if not addr or not pw:
            return "Gmail no está conectado. Pedile al usuario que lo conecte en Conectores."
        if act == "send":
            to = str(tool.get("to") or "").strip()
            subject = str(tool.get("subject") or "").strip() or "(sin asunto)"
            body = str(tool.get("body") or "")
            if "@" not in to:
                return "falta el destinatario"
            msg = MIMEText(body, "plain", "utf-8")
            msg["From"] = addr
            msg["To"] = to
            msg["Subject"] = subject
            with smtplib.SMTP("smtp.gmail.com", 587, timeout=25) as smtp:
                smtp.starttls()
                smtp.login(addr, pw)
                smtp.sendmail(addr, [to], msg.as_string())
            return f"mail enviado a {to} desde {addr}"
        if act in {"", "inbox", "read"}:
            mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
            try:
                mail.login(addr, pw)
                mail.select("INBOX", readonly=True)
                _, data = mail.search(None, "ALL")
                ids = (data[0] or b"").split()
                latest = ids[-8:]
                lines = []
                for mid in reversed(latest):
                    _, raw = mail.fetch(mid, "(RFC822.HEADER)")
                    payload = raw[0][1] if raw and raw[0] else b""
                    parsed = email_lib.message_from_bytes(payload)
                    subj = parsed.get("Subject") or "(sin asunto)"
                    who = parsed.get("From") or ""
                    lines.append(f"- {who} · {subj}")
                return "bandeja de " + addr + ":\n" + ("\n".join(lines) or "vacía")
            finally:
                try:
                    mail.logout()
                except Exception:
                    pass
        return "acción de Gmail desconocida (inbox|send)"
    return "conector desconocido"


def register(app) -> None:
    from fastapi import HTTPException
    from pydantic import BaseModel

    class ConnectIn(BaseModel):
        token: str | None = None
        email: str | None = None
        app_password: str | None = None

    @app.get("/api/connectors")
    def api_list():
        return {"ok": True, "items": public_status()}

    @app.post("/api/connectors/{kind}")
    def api_connect(kind: str, payload: ConnectIn):
        try:
            return connect(kind, payload.model_dump())
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.delete("/api/connectors/{kind}")
    def api_disconnect(kind: str):
        return disconnect(kind)
