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
    "También tenés un NAVEGADOR REAL (Chrome en la nube) que el usuario ve en vivo:\n"
    '```json\n{"tool":"browser","action":"start"}\n```\n'
    'Después: {"tool":"browser","action":"navigate","url":"https://…"} · '
    '{"tool":"browser","action":"click","selector":"#boton"} · '
    '{"tool":"browser","action":"type","selector":"input[name=q]","text":"hola"} · '
    '{"tool":"browser","action":"read"} · '
    '{"tool":"browser","action":"stop"}\n'
    "Vas a recibir el resultado y podés seguir usándola o responder final. "
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
        if isinstance(data, dict) and data.get("tool") in {"bash", "python", "write", "read", "fetch", "browser"}:
            return data
    return None


def strip_tools(text: str) -> str:
    """Quita los bloques JSON de herramienta del texto final que ve el usuario."""
    return (_TOOL_BLOCK.sub("", text or "")).strip()


def _browser_tool(agent_id: str, tool: dict) -> str:
    """Herramienta del chat: maneja el Chrome real en la nube."""
    from app import browsers

    act = str(tool.get("action") or "navigate").strip().lower()
    try:
        if act == "start":
            st = browsers.start(agent_id)
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
        if act == "type":
            r = browsers.action(agent_id, "type",
                                selector=str(tool.get("selector") or ""),
                                text=str(tool.get("text") or ""))
            return "texto escrito en " + str(r.get("url"))
        return "acción de navegador desconocida (usá start|navigate|click|type|read|stop)"
    except browsers.BrowserError as exc:
        return f"error de navegador: {exc}"


def execute_tool(agent_id: str, agent_name: str | None, tool: dict) -> str:
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
        if kind == "read":
            body = read(agent_id, str(tool.get("name") or ""))
            if len(body) > 6_000:
                body = body[:6_000] + "\n… (truncado)"
            return f"contenido de {tool.get('name')}:\n{body}"
        if kind == "browser":
            return _browser_tool(agent_id, tool)
        if kind == "fetch":
            r = fetch(str(tool.get("url") or ""))
            head = f"{r['title'] or '(sin título)'} — {r['url']}\n\n"
            return head + (r["text"] or "")[:6_000]
    except ComputerError as exc:
        return f"error de herramienta: {exc}"
    except Exception as exc:  # pragma: no cover
        return f"error de herramienta: {exc}"
    return "error de herramienta: herramienta desconocida"
