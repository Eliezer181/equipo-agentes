"""Navegador real en la nube por especialista (Browserbase o Anchor).

Cada especialista puede encender un Chrome REAL que corre en la nube.
El agente lo maneja (navigate/click/type/read) y el usuario lo ve en
vivo desde el escritorio (URL de vista embebible).

Proveedores (se elige solo, con fallback automático):
- Browserbase: BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID
- Anchor:      ANCHOR_API_KEY (api.anchorbrowser.io, CDP igual que BB)

Si ambos están configurados se prefiere Browserbase; si falla (cuota,
conexión), se reintenta automáticamente con Anchor.

Control de costo: la sesión se apaga sola a los 15 minutos o cuando
el usuario/el agente la apagan explícitamente.
"""
from __future__ import annotations

import json
import secrets
import os
import re
import time
import urllib.error
import urllib.request

BB_API_KEY = (os.environ.get("BROWSERBASE_API_KEY") or "").strip()
BB_PROJECT_ID = (os.environ.get("BROWSERBASE_PROJECT_ID") or "").strip()
ANCHOR_API_KEY = (os.environ.get("ANCHOR_API_KEY") or "").strip()

_BB_API = "https://api.browserbase.com/v1"
_ANCHOR_API = "https://api.anchorbrowser.io/v1"
SESSION_SECONDS = 900
ANCHOR_MAX_SECONDS = 3600  # límite hard de Anchor: 60 min por sesión
MAX_FREE_BROWSERS = 2
VIEWPORT_W = 1600
VIEWPORT_H = 900
_SESSIONS: dict[str, dict] = {}


class BrowserError(Exception):
    """Error amigable del navegador del agente."""


class PremiumRequired(BrowserError):
    """Se necesita suscripción premium para más navegadores."""


# ------------------------------------------------------------------ helpers

def _bb_configured() -> bool:
    return bool(BB_API_KEY and BB_PROJECT_ID)


def _anchor_configured() -> bool:
    return bool(ANCHOR_API_KEY)


def configured() -> bool:
    return _bb_configured() or _anchor_configured()


def _http_json(url: str, headers: dict, data: dict | None = None,
               method: str | None = None) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode() if data is not None else None,
        headers=headers,
        method=method or ("POST" if data is not None else "GET"),
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read() or b"{}")


def _bb_api(path: str, data: dict | None = None, method: str | None = None) -> dict:
    req = urllib.request.Request(
        _BB_API + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"X-BB-API-Key": BB_API_KEY, "Content-Type": "application/json"},
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


def _anchor_api(path: str, data: dict | None = None, method: str | None = None) -> dict:
    try:
        return _http_json(
            _ANCHOR_API + path,
            headers={"anchor-api-key": ANCHOR_API_KEY, "Content-Type": "application/json"},
            data=data,
            method=method,
        )
    except urllib.error.HTTPError as exc:
        try:
            detail = (exc.read() or b"{}").decode(errors="replace")[:200]
        except Exception:
            detail = ""
        raise BrowserError(f"Anchor {exc.code}: {detail}".strip()) from exc
    except Exception as exc:
        raise BrowserError(f"no se pudo conectar con Anchor: {exc}") from exc


# ---------------------------------------------------------- anchor sessions

def _anchor_create() -> tuple[str, str, str]:
    """Crea una sesión de Anchor. Devuelve (session_id, cdp_url, live_view)."""
    r = _anchor_api("/sessions", {})
    d = r.get("data") or {}
    if not d.get("cdp_url"):
        raise BrowserError("Anchor no devolvió conexión CDP")
    return d["id"], d["cdp_url"], d.get("live_view_url") or ""


def _anchor_running(session_id: str) -> bool:
    try:
        d = _anchor_api(f"/sessions/{session_id}").get("data") or {}
    except BrowserError:
        return False
    return d.get("status") == "running"


def _anchor_stop(session_id: str) -> None:
    try:
        _anchor_api(f"/sessions/{session_id}", method="DELETE")
    except Exception:
        pass


# ------------------------------------------------------------ sesión activa

def _session_status(st: dict) -> dict | None:
    """None si la sesión murió; dict del proveedor si sigue viva."""
    if st.get("provider") == "anchor":
        if _anchor_running(st["session"]):
            return {"ok": True}
        return None
    try:
        s = _bb_api(f"/sessions/{st['session']}")
    except BrowserError:
        return None
    if s.get("status") == "RUNNING":
        st["expires"] = s.get("expiresAt")
        return {"ok": True, "bb": s}
    return None


def _prune_and_count() -> int:
    alive = 0
    for key, st in list(_SESSIONS.items()):
        if _session_status(st) is not None:
            alive += 1
        else:
            _SESSIONS.pop(key, None)
    return alive


def _provider_status(specialist_id: str, st: dict) -> dict:
    expires = st.get("expires")
    if st.get("provider") == "anchor":
        expires = st.get("expires") or time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() + SESSION_SECONDS))
    return {
        "on": True,
        "configured": True,
        "provider": st.get("provider"),
        "sessionId": st["session"],
        "expiresAt": expires,
        "viewerUrl": st.get("viewer") or "",
        "viewportWidth": VIEWPORT_W,
        "viewportHeight": VIEWPORT_H,
    }


def status(specialist_id: str) -> dict:
    st = _SESSIONS.get(specialist_id)
    if not st:
        return {"on": False, "configured": configured()}
    if _session_status(st) is None:
        _SESSIONS.pop(specialist_id, None)
        return {"on": False, "configured": configured()}
    return _provider_status(specialist_id, st)


def _create_session(specialist_id: str, last_url: str = "") -> dict:
    """Crea una sesión nueva con el mejor proveedor disponible.

    Devuelve la entrada de _SESSIONS ya guardada.
    """
    if _bb_configured():
        try:
            s = _bb_api("/sessions", {"projectId": BB_PROJECT_ID, "timeout": SESSION_SECONDS,
                                      "keepAlive": True,
                                      "browserSettings": {"viewport": {"width": VIEWPORT_W, "height": VIEWPORT_H}}})
            if s.get("connectUrl"):
                try:
                    d = _bb_api(f"/sessions/{s['id']}/debug")
                    viewer = d.get("debuggerFullscreenUrl") or d.get("debuggerUrl") or ""
                except BrowserError:
                    viewer = ""
                st = {"provider": "bb", "session": s["id"], "connect": s["connectUrl"],
                      "viewer": viewer, "expires": s.get("expiresAt"), "last_url": last_url}
                _SESSIONS[specialist_id] = st
                return st
            raise BrowserError("la sesión de Browserbase no devolvió conexión")
        except BrowserError:
            if not _anchor_configured():
                raise
    if not _anchor_configured():
        raise BrowserError("ningún proveedor de navegador está configurado (faltan los secretos)")
    session_id, cdp, live = _anchor_create()
    st = {"provider": "anchor", "session": session_id, "connect": cdp,
          "viewer": live, "expires": None, "last_url": last_url}
    _SESSIONS[specialist_id] = st
    return st


def start(specialist_id: str, is_pro: bool = False) -> dict:
    if not configured():
        raise BrowserError("el navegador no está configurado (faltan los secretos)")
    cur = status(specialist_id)
    if cur.get("on"):
        return cur
    if not is_pro and _prune_and_count() >= MAX_FREE_BROWSERS:
        raise PremiumRequired(
            f"Ya hay {MAX_FREE_BROWSERS} navegadores encendidos (límite del plan gratis). "
            "Para encender un 3er navegador activá la suscripción premium "
            "(US$30/mes) desde tu perfil."
        )
    st = _create_session(specialist_id)
    return _provider_status(specialist_id, st)


def stop(specialist_id: str) -> dict:
    st = _SESSIONS.pop(specialist_id, None)
    if st:
        if st.get("provider") == "anchor":
            _anchor_stop(st["session"])
        else:
            try:
                _bb_api(f"/sessions/{st['session']}", {"status": "REQUEST_RELEASE"})
            except Exception:
                pass
    return {"on": False, "configured": configured()}


def _connect_url(specialist_id: str) -> str:
    st = _SESSIONS.get(specialist_id)
    if not st:
        raise BrowserError("el navegador está apagado (encendelo primero)")
    if _session_status(st) is None:
        _SESSIONS.pop(specialist_id, None)
        raise BrowserError("la sesión expiró (encendé el navegador de nuevo)")
    return st.get("connect") or ""


def _valid_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        raise BrowserError("falta la URL")
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", url):
        url = "https://" + url.lstrip("/")
    return url


def _safe_title(page) -> str:
    try:
        return (page.title() or "")[:120]
    except Exception:
        return ""


def _snap(page, specialist_id: str) -> dict:
    from app.store import DATA
    shot_dir = DATA / "computers" / specialist_id / "screenshots"
    shot_dir.mkdir(parents=True, exist_ok=True)
    name = f"{int(time.time())}_{secrets.token_hex(4)}.png"
    raw = page.screenshot(timeout=8000, type="jpeg", quality=52, animations="disabled")
    (shot_dir / name).write_bytes(raw)
    return {
        "shot": f"/api/specialists/{specialist_id}/browser/shot/{name}",
        "size": len(raw),
    }


def _reconnect(specialist_id: str) -> str:
    """Re-crea la sesión del navegador tras una caída y conserva la última página."""
    st = _SESSIONS.pop(specialist_id, None) or {}
    last_url = st.get("last_url", "")
    if st.get("provider") == "anchor":
        _anchor_stop(st.get("session") or "")
    new_st = _create_session(specialist_id, last_url=last_url)
    return new_st["connect"]


def action(specialist_id: str, do: str, url: str = "",
            selector: str = "", text: str = "",
            x: float | None = None, y: float | None = None) -> dict:
    reconnected = False
    try:
        connect = _connect_url(specialist_id)
    except BrowserError:
        # auto-reconexión: la sesión murió, la re-creamos y volvemos a la última página
        connect = _reconnect(specialist_id)
        reconnected = True
    from playwright.sync_api import TimeoutError as PWTimeout, sync_playwright

    p = sync_playwright().start()
    try:
        try:
            browser = p.chromium.connect_over_cdp(connect, timeout=18000)
        except Exception:
            if reconnected:
                raise
            connect = _reconnect(specialist_id)
            reconnected = True
            browser = p.chromium.connect_over_cdp(connect, timeout=18000)
        try:
            ctx = browser.contexts[0]
            page = ctx.pages[0] if ctx.pages else ctx.new_page()
            out: dict = {"do": do, "reconnected": reconnected}
            if reconnected and do != "navigate":
                st = _SESSIONS.get(specialist_id) or {}
                if st.get("last_url"):
                    try:
                        page.goto(st["last_url"], timeout=20000, wait_until="domcontentloaded")
                    except Exception:
                        pass
            if do == "navigate":
                page.goto(_valid_url(url), timeout=20000, wait_until="domcontentloaded")
                out.update(_snap(page, specialist_id))
            elif do == "click":
                if not selector:
                    raise BrowserError("falta el selector css del elemento")
                page.click(selector, timeout=10000)
            elif do == "click_text":
                if not text:
                    raise BrowserError("falta el texto del elemento a clickear")
                loc = page.get_by_text(text, exact=False).first
                loc.click(timeout=10000)
            elif do == "elements":
                items = page.evaluate("""() => {
                  const sel = 'a, button, input, textarea, select, [role=button], [role=link], [onclick]';
                  const seen = new Set(); const out = [];
                  for (const el of document.querySelectorAll(sel)) {
                    const r = el.getBoundingClientRect();
                    if (r.width === 0 || r.height === 0) continue;
                    let t = (el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || '').trim();
                    if (!t) continue;
                    if (seen.has(t)) continue; seen.add(t);
                    out.push({text: t.slice(0, 80), tag: el.tagName.toLowerCase()});
                    if (out.length >= 60) break;
                  }
                  return out;
                }""")
                out.update(elements=items)
            elif do == "type":
                if not selector:
                    raise BrowserError("falta el selector css del campo")
                page.fill(selector, text or "", timeout=10000)
            elif do == "scroll":
                page.mouse.wheel(0, -600 if (text or "").lower() == "up" else 600)
            elif do == "back":
                page.go_back(timeout=12000)
            elif do == "click_xy":
                if x is None or y is None:
                    raise BrowserError("faltan las coordenadas x,y")
                try:
                    real = page.evaluate(
                        "() => ({w: window.innerWidth, h: window.innerHeight})")
                    w, h = real["w"], real["h"]
                except Exception:
                    w, h = VIEWPORT_W, VIEWPORT_H
                if not w or not h:
                    w, h = VIEWPORT_W, VIEWPORT_H
                page.mouse.click(
                    max(0.0, min(1.0, x)) * w,
                    max(0.0, min(1.0, y)) * h,
                )
            elif do == "type_focused":
                if not text:
                    raise BrowserError("falta el texto")
                page.keyboard.type(text, delay=12)
            elif do == "key":
                if not text:
                    raise BrowserError("falta la tecla")
                page.keyboard.press(text)
            elif do == "screenshot":
                out.update(_snap(page, specialist_id))
            elif do == "read":
                body = page.locator("body").inner_text(timeout=15000)
                out.update(text=body[:4000])
            elif do == "read_selection":
                val = page.evaluate(
                    "() => { const s = window.getSelection && window.getSelection().toString(); "
                    "if (s) return s; const el = document.activeElement; "
                    "if (el && el.value !== undefined) return el.value; return ''; }"
                )
                out.update(text=(val or "")[:4000])
            else:
                raise BrowserError(f"acción desconocida: {do}")
            try:
                out.update(url=page.url, title=_safe_title(page))
                st = _SESSIONS.get(specialist_id)
                if st is not None and page.url and page.url != "about:blank":
                    st["last_url"] = page.url
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
