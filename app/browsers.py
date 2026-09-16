"""Navegador real en la nube (Browserbase) por especialista.

Cada especialista puede encender un Chrome REAL que corre en la nube
de Browserbase. El agente lo maneja (navigate/click/type/read) y el
usuario lo ve en vivo desde el escritorio (URL de vista embebible).

Control de costo: la sesión se apaga sola a los 15 minutos o cuando
el usuario/el agente la apagan explícitamente.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request

API_KEY = (os.environ.get("BROWSERBASE_API_KEY") or "").strip()
PROJECT_ID = (os.environ.get("BROWSERBASE_PROJECT_ID") or "").strip()
_API = "https://api.browserbase.com/v1"
SESSION_SECONDS = 900  # 15 min: control de costo por minuto
MAX_FREE_BROWSERS = 2  # plan gratis: 2 navegadores simultáneos (premium: 3)

# {specialist_id: {"session": id, "viewer": url, "expires": iso}}
_SESSIONS: dict[str, dict] = {}


class BrowserError(Exception):
    """Error amigable del navegador del agente."""


class PremiumRequired(BrowserError):
    """Se necesita suscripción premium para más navegadores."""


def _prune_and_count() -> int:
    """Limpia sesiones muertas y devuelve cuántas hay RUNNING ahora."""
    alive = 0
    for key, st in list(_SESSIONS.items()):
        try:
            s = _api(f"/sessions/{st['session']}")
        except BrowserError:
            s = None
        if s and s.get("status") == "RUNNING":
            alive += 1
        else:
            _SESSIONS.pop(key, None)
    return alive


def configured() -> bool:
    return bool(API_KEY and PROJECT_ID)


def _api(path: str, data: dict | None = None, method: str | None = None) -> dict:
    req = urllib.request.Request(
        _API + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"X-BB-API-Key": API_KEY, "Content-Type": "application/json"},
        method=method or ("POST" if data is not None else "GET"),
    )
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read() or b"{}").get("message", "")
        except Exception:
            detail = ""
        if "concurrency" in str(detail).lower():
            raise BrowserError(
                "límite de navegadores simultáneos alcanzado (apagá uno y reintentá)"
            ) from exc
        raise BrowserError(f"Browserbase {exc.code}: {detail}".strip()) from exc
    except Exception as exc:
        raise BrowserError(f"no se pudo conectar con Browserbase: {exc}") from exc


def status(specialist_id: str) -> dict:
    st = _SESSIONS.get(specialist_id)
    if not st:
        return {"on": False, "configured": configured()}
    try:
        s = _api(f"/sessions/{st['session']}")
    except BrowserError:
        _SESSIONS.pop(specialist_id, None)
        return {"on": False, "configured": configured()}
    if s.get("status") != "RUNNING":
        _SESSIONS.pop(specialist_id, None)
        return {"on": False, "configured": configured()}
    st["expires"] = s.get("expiresAt")
    return {
        "on": True,
        "configured": True,
        "sessionId": st["session"],
        "expiresAt": s.get("expiresAt"),
        "viewerUrl": st["viewer"],
    }


def start(specialist_id: str, is_pro: bool = False) -> dict:
    if not configured():
        raise BrowserError("Browserbase no está configurado (faltan los secretos)")
    cur = status(specialist_id)
    if cur.get("on"):
        return cur
    # Plan gratis: máximo 3 navegadores simultáneos; el 4º es premium
    if not is_pro and _prune_and_count() >= MAX_FREE_BROWSERS:
        raise PremiumRequired(
            f"Ya hay {MAX_FREE_BROWSERS} navegadores encendidos (límite del plan gratis). "
            "Para encender un 3er navegador activá la suscripción premium "
            "(US$30/mes) desde tu perfil."
        )
    # keepAlive: sin esto, cerrar la última conexión CDP termina la sesión
    s = _api("/sessions", {"projectId": PROJECT_ID, "timeout": SESSION_SECONDS,
                           "keepAlive": True})
    if not s.get("connectUrl"):
        raise BrowserError("la sesión no devolvió conexión")
    d = _api(f"/sessions/{s['id']}/debug")
    viewer = d.get("debuggerFullscreenUrl") or d.get("debuggerUrl") or ""
    _SESSIONS[specialist_id] = {
        "session": s["id"],
        "viewer": viewer,
        "expires": s.get("expiresAt"),
    }
    return {
        "on": True,
        "configured": True,
        "sessionId": s["id"],
        "expiresAt": s.get("expiresAt"),
        "viewerUrl": viewer,
    }


def stop(specialist_id: str) -> dict:
    st = _SESSIONS.pop(specialist_id, None)
    if st:
        try:
            _api(f"/sessions/{st['session']}", {"status": "REQUEST_RELEASE"})
        except Exception:
            pass
    return {"on": False, "configured": configured()}


def _connect_url(specialist_id: str) -> str:
    st = _SESSIONS.get(specialist_id)
    if not st:
        raise BrowserError("el navegador está apagado (encendelo primero)")
    s = _api(f"/sessions/{st['session']}")
    if s.get("status") != "RUNNING":
        _SESSIONS.pop(specialist_id, None)
        raise BrowserError("la sesión expiró (encendé el navegador de nuevo)")
    return s["connectUrl"]


def _valid_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise BrowserError("falta la URL")
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url.lstrip("/")
    return url


def _safe_title(page) -> str:
    try:
        return (page.title() or "")[:120]
    except Exception:
        return ""


def action(specialist_id: str, do: str, url: str = "",
            selector: str = "", text: str = "",
            x: float | None = None, y: float | None = None) -> dict:
    """Ejecuta una acción en el Chrome real del especialista.

    do: navigate | click | type | scroll | back | read |
        click_xy | type_focused | key
    x/y (click_xy) son fracciones 0..1 del viewport (cursor táctil:
    el frontend nunca necesita saber el tamaño real de la página).
    Cada acción abre y cierra su conexión CDP (sin estado entre hilos).
    """
    connect = _connect_url(specialist_id)
    from playwright.sync_api import TimeoutError as PWTimeout, sync_playwright

    p = sync_playwright().start()
    try:
        browser = p.chromium.connect_over_cdp(connect, timeout=45000)
        try:
            ctx = browser.contexts[0]
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            out: dict = {"do": do}
            if do == "navigate":
                page.goto(_valid_url(url), timeout=45000, wait_until="domcontentloaded")
            elif do == "click":
                if not selector:
                    raise BrowserError("falta el selector css del elemento")
                page.click(selector, timeout=10000)
            elif do == "type":
                if not selector:
                    raise BrowserError("falta el selector css del campo")
                page.fill(selector, text or "", timeout=10000)
            elif do == "scroll":
                page.mouse.wheel(0, -600 if (text or "").lower() == "up" else 600)
            elif do == "back":
                page.go_back(timeout=15000)
            elif do == "click_xy":
                if x is None or y is None:
                    raise BrowserError("faltan las coordenadas x,y")
                vp = page.viewport_size or {"width": 1280, "height": 800}  # propiedad, no método
                page.mouse.click(
                    max(0.0, min(1.0, x)) * vp["width"],
                    max(0.0, min(1.0, y)) * vp["height"],
                )
            elif do == "type_focused":
                if not text:
                    raise BrowserError("falta el texto")
                page.keyboard.type(text, delay=12)
            elif do == "key":
                if not text:
                    raise BrowserError("falta la tecla")
                page.keyboard.press(text)
            elif do == "read":
                body = page.locator("body").inner_text(timeout=15000)
                out.update(text=body[:4000])
            else:
                raise BrowserError(f"acción desconocida: {do}")
            try:
                out.update(url=page.url, title=_safe_title(page))
            except Exception:
                pass
            return out
        finally:
            try:
                browser.close()
            except Exception:
                pass
    except PWTimeout as exc:
        raise BrowserError("tiempo de espera agotado (¿existe el elemento?)") from exc
    except BrowserError:
        raise
    except Exception as exc:
        raise BrowserError(f"fallo del navegador: {exc}") from exc
    finally:
        try:
            p.stop()
        except Exception:
            pass
