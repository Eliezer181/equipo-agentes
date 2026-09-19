"""Computadora propia de cada agente.

Cada especialista tiene un directorio REAL en el servidor (persistente en el
volumen de Fly) con sus archivos, y puede:
  - ejecutar comandos bash (con timeout y límite de salida)
  - ejecutar código Python
  - crear / leer / borrar archivos propios
  - navegar páginas web (texto) con fetch()

El frontend usa estos mismos primitivos para el escritorio ("desk"), y el
agente los usa como herramientas durante el chat con bloques JSON.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import subprocess
import sys
import urllib.request
from pathlib import Path

from app.store import DATA

COMPUTERS_DIR = DATA / "computers"

# Límites de seguridad
CMD_TIMEOUT = 12           # segundos por comando
OUTPUT_CAP = 8_000         # bytes de stdout/stderr que se devuelven
FETCH_TIMEOUT = 10
FETCH_CAP = 6_000          # texto extraído de una página

# Comandos que no aportan nada y pueden romper el contenedor
DENYLIST = (
    "shutdown", "reboot", "halt", "poweroff", "mkfs", "dd if=", "dd of=/dev",
    "rm -rf /", "kill -9 1", "kill 1", "chmod -R 777 /", ":(){",
)

_ID_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
_NAME_RE = re.compile(r"^[A-Za-z0-9._\- ]{1,120}$")


class ComputerError(Exception):
    pass


def _safe_id(agent_id: str) -> str:
    agent_id = (agent_id or "").strip().lower()
    if not _ID_RE.match(agent_id):
        raise ComputerError("id de agente inválido")
    return agent_id


def _safe_name(name: str) -> str:
    name = (name or "").strip()
    if not _NAME_RE.match(name) or name in {".", ".."} or "/" in name or "\\" in name:
        raise ComputerError("nombre de archivo inválido")
    return name



# ---------------------------------------------------------------------------
# VAULT: memoria de credenciales del agente ("conector" persistente).
# Sobrevive a las sesiones del navegador (vive en el volumen) y guarda
# usuarios/contraseñas/tokens que el usuario le confía para loguear a
# sitios (GitHub, Gmail, etc.). Valores encriptados con Fernet; clave en
# env VAULT_KEY o generada en data/.vault.key (chmod 600). Sin librería
# cryptography, fallback base64 claro.
# ---------------------------------------------------------------------------

def _fernet():
    key = os.environ.get("VAULT_KEY", "").strip()
    key_path = DATA / ".vault.key"
    try:
        from cryptography.fernet import Fernet
    except Exception:
        return None
    try:
        if not key:
            if key_path.exists():
                key = key_path.read_text().strip()
            else:
                key = Fernet.generate_key().decode()
                key_path.write_text(key)
                try:
                    os.chmod(key_path, 0o600)
                except Exception:
                    pass
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        return None


def _vault_file(agent_id: str) -> Path:
    return home(agent_id) / ".vault.json"


def _vault_load(agent_id: str) -> dict:
    f = _vault_file(agent_id)
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text(encoding="utf-8") or "{}")
    except Exception:
        return {}


def _vault_save(agent_id: str, data: dict) -> None:
    f = _vault_file(agent_id)
    f.write_text(json.dumps(data, indent=2), encoding="utf-8")
    try:
        os.chmod(f, 0o600)
    except Exception:
        pass


def _vault_put(agent_id: str, key: str, value: str) -> None:
    data = _vault_load(agent_id)
    f = _fernet()
    import base64 as _b64
    data[key] = (f.encrypt(value.encode()).decode() if f
                 else "b64:" + _b64.b64encode(value.encode()).decode())
    _vault_save(agent_id, data)


def _vault_get(agent_id: str, key: str) -> str | None:
    import base64 as _b64
    val = _vault_load(agent_id).get(key)
    if not val:
        return None
    if val.startswith("b64:"):
        return _b64.b64decode(val[4:]).decode()
    f = _fernet()
    if f:
        try:
            return f.decrypt(val.encode()).decode()
        except Exception:
            return None
    return val

def home(agent_id: str, agent_name: str | None = None) -> Path:
    """Directorio del agente; lo crea con un README de bienvenida la 1ra vez."""
    d = COMPUTERS_DIR / _safe_id(agent_id)
    if not d.exists():
        d.mkdir(parents=True, exist_ok=True)
        readme = d / "README.md"
        if not readme.exists():
            readme.write_text(
                f"# Computadora de {agent_name or agent_id}\n\n"
                "Esta es TU computadora. Acá podés guardar archivos, correr comandos\n"
                "y ejecutar código. Lo que guardes queda para la próxima.\n",
                encoding="utf-8",
            )
    return d


def ls(agent_id: str, agent_name: str | None = None) -> list[dict]:
    d = home(agent_id, agent_name)
    out = []
    for p in sorted(d.iterdir(), key=lambda x: x.name):
        if p.is_file():
            out.append({
                "name": p.name,
                "size": p.stat().st_size,
                "modified": p.stat().st_mtime,
            })
    return out


def read(agent_id: str, name: str) -> str:
    p = home(agent_id) / _safe_name(name)
    if not p.is_file():
        raise ComputerError(f"no existe {name}")
    try:
        return p.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"(archivo binario, {p.stat().st_size} bytes)"


def write(agent_id: str, name: str, body: str) -> dict:
    p = home(agent_id) / _safe_name(name)
    p.write_text(body or "", encoding="utf-8")
    return {"ok": True, "name": p.name, "size": len(body or "")}


_MIME_BY_EXT = {
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".json": "application/json",
    ".html": "text/html; charset=utf-8",
}


def read_bytes(agent_id: str, name: str) -> tuple[bytes, str]:
    """Lee un archivo del agente como bytes crudos (para descargar: PDFs, etc.)."""
    p = home(agent_id) / _safe_name(name)
    if not p.is_file():
        raise ComputerError(f"no existe {name}")
    mime = _MIME_BY_EXT.get(p.suffix.lower(), "application/octet-stream")
    return p.read_bytes(), mime


def _latin1_safe(text: str) -> str:
    """Los fonts base de fpdf2 (Helvetica) sólo cubren Latin-1 (incluye tildes
    y ñ). Reemplazamos cualquier carácter fuera de ese rango (emojis, etc.)."""
    return (text or "").encode("latin-1", "replace").decode("latin-1")


def write_pdf(agent_id: str, name: str, title: str, body: str) -> dict:
    """Genera un PDF prolijo (títulos, subtítulos, viñetas, párrafos) a partir
    de texto con un mini-formato tipo markdown (#, ##, ###, - item)."""
    from fpdf import FPDF

    doc_title = _latin1_safe(title or name or "Documento")

    class ReportPDF(FPDF):
        def header(self):
            if self.page_no() == 1:
                return
            self.set_font("Helvetica", "", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 8, doc_title[:90])
            self.ln(2)
            self.set_draw_color(215, 215, 215)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(4)

        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "", 8)
            self.set_text_color(160, 160, 160)
            self.cell(0, 10, f"Página {self.page_no()}", align="C")

    pdf = ReportPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(16, 16, 16)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(20, 20, 20)
    pdf.multi_cell(0, 10, doc_title)

    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(130, 130, 130)
    from datetime import datetime, timezone
    pdf.cell(0, 6, datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M UTC"))
    pdf.ln(3)
    pdf.set_draw_color(210, 210, 210)
    pdf.line(pdf.l_margin, pdf.get_y(), 210 - pdf.r_margin, pdf.get_y())
    pdf.ln(6)

    for raw_line in (body or "").split(chr(10)):
        line = _latin1_safe(raw_line.rstrip())
        stripped = line.strip()
        if not stripped:
            pdf.ln(3)
            continue
        clean = stripped.replace("**", "").replace("__", "")
        if clean.startswith("### "):
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(30, 30, 30)
            pdf.ln(2)
            pdf.multi_cell(0, 7, clean[4:])
            pdf.ln(1)
        elif clean.startswith("## "):
            pdf.set_font("Helvetica", "B", 14)
            pdf.set_text_color(15, 15, 15)
            pdf.ln(3)
            pdf.multi_cell(0, 8, clean[3:])
            pdf.ln(1)
        elif clean.startswith("# "):
            pdf.set_font("Helvetica", "B", 16)
            pdf.set_text_color(10, 10, 10)
            pdf.ln(4)
            pdf.multi_cell(0, 9, clean[2:])
            pdf.ln(2)
        elif clean.startswith(("- ", "* ")):
            pdf.set_font("Helvetica", "", 11)
            pdf.set_text_color(45, 45, 45)
            pdf.set_x(pdf.l_margin + 4)
            pdf.multi_cell(0, 6.5, "-  " + clean[2:])
        elif re.match(r"^\d+\.\s", clean):
            pdf.set_font("Helvetica", "", 11)
            pdf.set_text_color(45, 45, 45)
            pdf.set_x(pdf.l_margin + 4)
            pdf.multi_cell(0, 6.5, clean)
        else:
            pdf.set_font("Helvetica", "", 11)
            pdf.set_text_color(45, 45, 45)
            pdf.multi_cell(0, 6.5, clean)

    safe_name = _safe_name(name or "documento.pdf")
    if not safe_name.lower().endswith(".pdf"):
        safe_name += ".pdf"
    p = home(agent_id) / safe_name
    pdf.output(str(p))
    return {"ok": True, "name": p.name, "size": p.stat().st_size}


def delete(agent_id: str, name: str) -> dict:
    p = home(agent_id) / _safe_name(name)
    if not p.is_file():
        raise ComputerError(f"no existe {name}")
    p.unlink()
    return {"ok": True}


def _guard(cmd: str) -> None:
    low = (cmd or "").lower()
    for bad in DENYLIST:
        if bad in low:
            raise ComputerError("comando bloqueado")


def _cap(text: str) -> str:
    text = text or ""
    if len(text) > OUTPUT_CAP:
        return text[:OUTPUT_CAP] + f"\n… (salida truncada, {len(text)} bytes)"
    return text


def run(agent_id: str, cmd: str) -> dict:
    """Ejecuta un comando bash dentro de la carpeta del agente."""
    if not cmd or not cmd.strip():
        raise ComputerError("comando vacío")
    _guard(cmd)
    d = home(agent_id)
    try:
        proc = subprocess.run(
            ["/bin/bash", "-lc", cmd],
            cwd=str(d),
            capture_output=True,
            text=True,
            timeout=CMD_TIMEOUT,
            env={**os.environ, "HOME": str(d), "PAGER": "cat"},
        )
        return {
            "code": proc.returncode,
            "stdout": _cap(proc.stdout),
            "stderr": _cap(proc.stderr),
        }
    except subprocess.TimeoutExpired:
        return {"code": 124, "stdout": "", "stderr": f"(tiempo agotado: más de {CMD_TIMEOUT}s)"}
    except Exception as exc:  # pragma: no cover
        return {"code": 1, "stdout": "", "stderr": f"error: {exc}"}


def run_python(agent_id: str, code: str) -> dict:
    """Ejecuta código Python dentro de la carpeta del agente."""
    if not code or not code.strip():
        raise ComputerError("código vacío")
    d = home(agent_id)
    try:
        proc = subprocess.run(
            [sys.executable, "-c", code],
            cwd=str(d),
            capture_output=True,
            text=True,
            timeout=CMD_TIMEOUT,
            env={**os.environ, "HOME": str(d), "PAGER": "cat"},
        )
        return {
            "code": proc.returncode,
            "stdout": _cap(proc.stdout),
            "stderr": _cap(proc.stderr),
        }
    except subprocess.TimeoutExpired:
        return {"code": 124, "stdout": "", "stderr": f"(tiempo agotado: más de {CMD_TIMEOUT}s)"}
    except Exception as exc:  # pragma: no cover
        return {"code": 1, "stdout": "", "stderr": f"error: {exc}"}


def fetch(url: str) -> dict:
    """Trae el título y el texto de una página http(s) para el navegador del agente."""
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ComputerError("solo URLs http(s)")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; EquipoAgentes/1.0)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            ctype = resp.headers.get("content-type", "")
            raw = resp.read(2_000_000)
    except Exception as exc:
        raise ComputerError(f"no se pudo abrir: {exc}") from exc
    title, text = "", ""
    if "html" in ctype.lower() or raw[:50].lstrip().lower().startswith(b"<!doctype") or b"<html" in raw[:200].lower():
        html = raw.decode("utf-8", "ignore")
        m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if m:
            title = re.sub(r"\s+", " ", m.group(1)).strip()
        body = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
        text = re.sub(r"<[^>]+>", " ", body)
        text = re.sub(r"&nbsp;", " ", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = "\n".join(ln.strip() for ln in text.splitlines() if ln.strip())
    else:
        text = raw.decode("utf-8", "ignore")
    if len(text) > FETCH_CAP:
        text = text[:FETCH_CAP] + "\n… (texto truncado)"
    return {"url": url, "title": title, "content_type": ctype, "text": text}


def proxy_page(url: str) -> tuple[bytes, str]:
    """Trae una página COMPLETA (HTML crudo) para renderizar en el navegador
    del escritorio. Inyecta <base href> para que CSS/imágenes relativos
    carguen desde el sitio original. Devuelve (bytes, content_type)."""
    url = (url or "").strip()
    if not url.startswith(("http://", "https://")):
        raise ComputerError("solo URLs http(s)")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"},
    )
    try:
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT) as resp:
            ctype = resp.headers.get("content-type", "text/html")
            raw = resp.read(2_000_000)
    except Exception as exc:
        raise ComputerError(f"no se pudo abrir: {exc}") from exc
    low = ctype.lower()
    if "html" in low or raw[:200].lstrip().lower().startswith((b"<!doctype", b"<html")):
        base_tag = f'<base href="{url}">'.encode("utf-8")
        m = re.search(rb"<head[^>]*>", raw, re.IGNORECASE)
        if m:
            insert_at = m.end()
            raw = raw[:insert_at] + base_tag + raw[insert_at:]
        else:
            raw = b"<head>" + base_tag + b"</head>" + raw
        ctype = "text/html; charset=utf-8"
    return raw, ctype


# ---------------------------------------------------------------------------
# Protocolo de herramientas para el chat del agente
# ---------------------------------------------------------------------------

TOOL_HINT = (
    "\n\n## Tu computadora\n"
    "Tenés TU PROPIA computadora en el servidor, con carpeta de archivos "
    "persistente. Podés ejecutar bash y Python y manejar tus archivos.\n"
    "Para usarla, incluí UN bloque JSON (puede ir solo):\n"
    '```json\n{"tool": "bash", "cmd": "ls"}\n```\n'
    'Otras herramientas: {"tool":"python","code":"print(1+1)"} · '
    '{"tool":"write","name":"nota.md","body":"contenido"} · '
    '{"tool":"read","name":"nota.md"} · '
    '{"tool":"fetch","url":"https://ejemplo.com"}\n'
    "## Enviar archivos al usuario (PDF / TXT)\n"
    "Si el usuario te pide un PDF, un reporte, un resumen o un archivo de texto "
    "para descargar, generalo prolijo con esta herramienta (no con write, que es "
    "solo para tus notas internas):\n"
    '```json\n{"tool":"file","format":"pdf","name":"reporte.pdf","title":"Título del documento","body":"# Sección 1\\n\\nTexto...\\n\\n- viñeta 1\\n- viñeta 2\\n\\n## Subsección\\nMás texto."}\n```\n'
    "El campo body admite mini-markdown: # / ## / ### para títulos y subtítulos, "
    "líneas que empiezan con \"- \" para viñetas, el resto son párrafos normales. "
    "Para un .txt simple usá format:\"txt\" (o terminá el name en .txt).\n"
    "La herramienta te devuelve un link tipo /api/specialists/.../download: "
    "SIEMPRE incluí ese link en tu respuesta al usuario como [nombre](link) para "
    "que lo pueda descargar tocándolo.\n"
    "También tenés un NAVEGADOR REAL (Chrome en la nube) que el usuario ve en vivo "
    "mientras lo usás. Si el usuario te pide buscar, abrir o hacer algo en la web, "
    "MANEJALO VOS: encendé (se enciende solo si ya lo está), navegá, leé y clickeá "
    "hasta completar la tarea, y contale lo que encontraste.\n"
    '```json\n{"tool":"browser","action":"navigate","url":"https://…"}\n```\n'
    'Click por TEXTO VISIBLE (lo normal): {"tool":"browser","action":"click_text","text":"Iniciar sesión"}\n'
    'Escribir en el campo enfocado: {"tool":"browser","action":"type","text":"precio del dólar"}\n'
    'Tecla: {"tool":"browser","action":"key","text":"Enter"}\n'
    'Leer la página: {"tool":"browser","action":"read"} · '
    'Listar botones/links clickeables: {"tool":"browser","action":"elements"}\n'
    'Scroll: {"tool":"browser","action":"scroll","text":"down"} · '
    'Atrás: {"tool":"browser","action":"back"} · '
    'Captura para mostrar lo que ves: {"tool":"browser","action":"screenshot"} (devuelve una URL: incluíla en tu respuesta como ![captura](URL)) · '
    'Apagar: {"tool":"browser","action":"stop"}\n'
    "## Tus credenciales (vault persistente)\n"
    "Tenés una memoria de credenciales que SOBREVIVE al apagado del navegador.\n"
    'Guardar: {"tool":"vault","action":"save","key":"github","value":"usuario:token"} · '
    'Leer: {"tool":"vault","action":"get","key":"github"} · '
    'Listar: {"tool":"vault","action":"list"}\n'
    "LOGIN en sitios: 1) intentá entrar; 2) si pide credenciales, consultá el "
    "vault (get) y NUNCA inventes; 3) si no la tenés, pedile al usuario por "
    "el chat usuario/contraseña o token, guardala con vault save y usala; "
    "4) si llega un código 2FA (Gmail/SMS), pedile al usuario que te pegue el "
    "código en el chat; el navegador queda encendido 15 min esperándolo. "
    "NUNCA muestres contraseñas ni tokens en tus respuestas.\n"
    'Flujo típico: navigate → read (o elements) → click_text → read → respondé al usuario. '
    "Vas a recibir el resultado de cada acción y podés seguir usándola o responder final. "
    "Después del bloque podés escribir una frase breve. Si no la necesitás, "
    "respondé normal sin bloque."
)

_TOOL_BLOCK = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_tool(text: str) -> dict | None:
    """Busca el último bloque JSON con 'tool' válido en la respuesta."""
    for m in list(_TOOL_BLOCK.finditer(text or ""))[::-1]:
        try:
            data = json.loads(m.group(1))
        except (json.JSONDecodeError, ValueError):
            continue
        if isinstance(data, dict) and data.get("tool") in {"bash", "python", "write", "read", "fetch", "browser", "vault", "file"}:
            return data
    return None


def strip_tools(text: str) -> str:
    """Quita los bloques JSON de herramienta del texto final que ve el usuario."""
    return (_TOOL_BLOCK.sub("", text or "")).strip()


def _browser_tool(agent_id: str, tool: dict, is_pro: bool = False, base_url: str = "") -> str:
    """Herramienta del chat: maneja el Chrome real en la nube."""
    from app import browsers

    act = str(tool.get("action") or "navigate").strip().lower()
    try:
        # Auto-encendido: si el agente quiere navegar sin encender primero,
        # encendemos por él (el usuario lo ve aparecer en vivo en su escritorio)
        if act not in {"start", "stop", "status"} and not browsers.status(agent_id).get("on"):
            browsers.start(agent_id, is_pro=is_pro)
        if act not in {"start", "stop", "status", "navigate", "read", "click",
                       "click_text", "type", "elements", "key", "scroll", "back",
                       "screenshot"}:
            return ("acción de navegador desconocida (usá start|navigate|click_text|"
                    "type|key|elements|read|scroll|back|stop)")
        if act == "status":
            st = browsers.status(agent_id)
            return ("navegador encendido, expira " + str(st.get("expiresAt"))) if st.get("on") else "navegador apagado"
        if act == "start":
            st = browsers.start(agent_id, is_pro=is_pro)
            return (
                "navegador real ENCENDIDO en la nube (el usuario lo ve en vivo "
                "en su escritorio). Usá navigate/click/type/read para manejarlo. "
                f"Se apaga solo a los 15 min. Expira: {st.get('expiresAt')}"
            )
        if act == "stop":
            browsers.stop(agent_id)
            return "navegador apagado."
        if act == "navigate":
            r = browsers.action(agent_id, "navigate", url=str(tool.get("url") or ""))
            return f"página abierta: {r.get('title') or '(sin título)'} — {r.get('url')}"
        if act == "read":
            r = browsers.action(agent_id, "read")
            body = (r.get("text") or "").strip()
            return "texto visible de " + str(r.get("url")) + ":\n" + body[:6000]
        if act == "click":
            r = browsers.action(agent_id, "click", selector=str(tool.get("selector") or ""))
            return "click OK — ahora en: " + str(r.get("title") or r.get("url"))
        if act == "click_text":
            # Click por TEXTO VISIBLE: la forma natural de ordenar desde el chat
            r = browsers.action(agent_id, "click_text", text=str(tool.get("text") or tool.get("selector") or ""))
            return "click en '" + str(tool.get("text")) + "' OK — ahora en: " + str(r.get("title") or r.get("url"))
        if act == "type":
            if tool.get("selector"):
                r = browsers.action(agent_id, "type",
                                    selector=str(tool.get("selector")),
                                    text=str(tool.get("text") or ""))
            else:
                # sin selector: escribe en el campo enfocado (tras un click_text)
                r = browsers.action(agent_id, "type_focused", text=str(tool.get("text") or ""))
            return "texto escrito en " + str(r.get("url"))
        if act == "key":
            r = browsers.action(agent_id, "key", text=str(tool.get("text") or "Enter"))
            return "tecla " + str(tool.get("text") or "Enter") + " OK — ahora en: " + str(r.get("url"))
        if act == "elements":
            r = browsers.action(agent_id, "elements")
            els = r.get("elements") or []
            if not els:
                return "no se encontraron elementos clickeables con texto en la página"
            return "elementos clickeables de la página (usá click_text con estos textos):\n" + "\n".join(
                "- [" + str(e.get("tag")) + "] " + str(e.get("text")) for e in els[:40])
        if act == "screenshot":
            r = browsers.action(agent_id, "screenshot")
            shot_url = str(r.get("shot") or "")
            if base_url:
                shot_url = base_url.rstrip("/") + shot_url
            return ("captura de pantalla tomada (" + str(r.get("size")) + " bytes). "
                    "Para mostrársela al usuario incluí en tu respuesta final "
                    "exactamente: ![captura](" + shot_url + ")")
        if act == "scroll":
            browsers.action(agent_id, "scroll", text=str(tool.get("text") or "down"))
            return "scroll OK"
        if act == "back":
            r = browsers.action(agent_id, "back")
            return "atrás OK — ahora en: " + str(r.get("url"))
    except browsers.BrowserError as exc:
        return f"error de navegador: {exc}"


def _vault_tool(agent_id: str, tool: dict) -> str:
    """Memoria de credenciales del agente: guardar/leer tokens y contraseñas."""
    act = str(tool.get("action") or "").strip().lower()
    key = str(tool.get("key") or "").strip()
    if act not in {"save", "get", "list", "delete"}:
        return "acción de vault desconocida (usá save|get|list|delete)"
    if act in {"save", "get", "delete"} and not key:
        return "falta el nombre (key) de la credencial"
    if act == "save":
        val = str(tool.get("value") or "")
        if not val:
            return "falta el valor a guardar"
        _vault_put(agent_id, key, val)
        return ("credencial '" + key + "' guardada en tu memoria permanente "
                "(sobrevive al apagado del navegador). Nunca la muestres en texto "
                "al usuario; usala para loguear cuando te la pida.")
    if act == "get":
        val = _vault_get(agent_id, key)
        if val is None:
            return ("no tenés guardada ninguna credencial '" + key + "'. Pedile al "
                    "usuario usuario/contraseña/token por el chat y guardala con "
                    "la herramienta vault (action save).")
        return "credencial '" + key + "': " + val
    if act == "list":
        keys = sorted(_vault_load(agent_id).keys())
        return "credenciales guardadas: " + (", ".join(keys) if keys else "(ninguna)")
    if act == "delete":
        data = _vault_load(agent_id)
        if key in data:
            del data[key]
            _vault_save(agent_id, data)
            return "credencial '" + key + "' borrada"
        return "no existía la credencial '" + key + "'"


def execute_tool(agent_id: str, agent_name: str | None, tool: dict, is_pro: bool = False,
                  base_url: str = "") -> str:
    """Ejecuta una herramienta y devuelve el resultado como texto para el LLM."""
    kind = (tool or {}).get("tool")
    try:
        if kind == "bash":
            r = run(agent_id, str(tool.get("cmd") or ""))
            out = (r["stdout"] or "").strip()
            err = (r["stderr"] or "").strip()
            parts = [f"exit code: {r['code']}"]
            if out:
                parts.append("stdout:\n" + out)
            if err:
                parts.append("stderr:\n" + err)
            return "\n".join(parts) or "exit code: 0"
        if kind == "python":
            r = run_python(agent_id, str(tool.get("code") or ""))
            out = (r["stdout"] or "").strip()
            err = (r["stderr"] or "").strip()
            parts = [f"exit code: {r['code']}"]
            if out:
                parts.append("stdout:\n" + out)
            if err:
                parts.append("stderr:\n" + err)
            return "\n".join(parts) or "exit code: 0"
        if kind == "write":
            r = write(agent_id, str(tool.get("name") or ""), str(tool.get("body") or ""))
            return f"guardado {r['name']} ({r['size']} caracteres)"
        if kind == "file":
            fmt = str(tool.get("format") or "").strip().lower()
            name = str(tool.get("name") or "").strip()
            title = str(tool.get("title") or name or "Documento")
            body = str(tool.get("body") or "")
            if not name:
                return "falta el nombre del archivo (name)"
            if fmt == "pdf" or name.lower().endswith(".pdf"):
                r = write_pdf(agent_id, name, title, body)
            else:
                if not name.lower().endswith(".txt"):
                    name += ".txt"
                r = write(agent_id, name, body)
            link = f"/api/specialists/{agent_id}/computer/files/{r['name']}/download"
            return (f"archivo '{r['name']}' creado ({r['size']} bytes). Para que el "
                    f"usuario lo descargue, incluí EN TU RESPUESTA el link markdown: "
                    f"[{r['name']}]({link})")
        if kind == "read":
            body = read(agent_id, str(tool.get("name") or ""))
            if len(body) > 6_000:
                body = body[:6_000] + "\n… (truncado)"
            return f"contenido de {tool.get('name')}:\n{body}"
        if kind == "browser":
            return _browser_tool(agent_id, tool, is_pro=is_pro, base_url=base_url)
        if kind == "vault":
            return _vault_tool(agent_id, tool)
        if kind == "fetch":
            r = fetch(str(tool.get("url") or ""))
            head = f"{r['title'] or '(sin título)'} — {r['url']}\n\n"
            return head + (r["text"] or "")[:6_000]
    except ComputerError as exc:
        return f"error de herramienta: {exc}"
    except Exception as exc:  # pragma: no cover
        return f"error de herramienta: {exc}"
    return "error de herramienta: herramienta desconocida"
