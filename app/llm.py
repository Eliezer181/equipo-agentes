from __future__ import annotations

import json
import os
import time as _time
from contextvars import ContextVar

from openai import OpenAI

from app import base44_client

LAST_PROVIDER: ContextVar[str] = ContextVar("last_llm_provider", default="deephat")

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
XAI_URL = "https://api.x.ai/v1"
DEEPHAT_URL = "https://router.huggingface.co/v1"
GEMINI_MODELS = (
    "gemini-3.8-flash",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-latest",
)
RETRYABLE = ("model not found", "invalid-argument", "not found", "does not exist")

RATE_LIMITED = ("429", "resource_exhausted", "quota", "rate limit",
                "rate_limit", "too many requests", "exceeded your current quota")


def record_llm_error(provider: str, stage: str, exc: Exception | None = None,
                     detail: str = "") -> None:
    msg = detail or (f"{type(exc).__name__}: {exc}" if exc else "desconocido")
    try:
        from app.store import DATA
        from datetime import datetime, timezone
        p = DATA / "llm_errors.json"
        data = []
        if p.exists():
            try:
                loaded = json.loads(p.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    data = loaded
            except Exception:
                data = []
        data.append({
            "at": datetime.now(timezone.utc).isoformat(),
            "provider": provider,
            "stage": stage,
            "error": msg[:400],
        })
        p.write_text(json.dumps(data[-50:], ensure_ascii=False, indent=2),
                     encoding="utf-8")
    except Exception:
        pass
    print(f"[llm] fallo {provider}/{stage}: {msg[:300]}")


def _keys() -> tuple[str, str]:
    gemini = os.getenv("GEMINI_API_KEY", "").strip()
    xai = os.getenv("XAI_API_KEY", "").strip()
    return gemini, xai


def _is_xai(key: str) -> bool:
    return key.startswith("xai-")


def _using_gemini() -> bool:
    return False


def client() -> OpenAI:
    raise RuntimeError("Gemini está desconectado. El cerebro activo es DeepHat.")


def _models() -> list[str]:
    return [_deephat_model()]


def _deephat_key() -> str:
    return os.getenv("DEEPHAT_API_KEY", "").strip()


def _deephat_base_url() -> str:
    return os.getenv("DEEPHAT_BASE_URL", "").strip() or DEEPHAT_URL


def _deephat_ready() -> bool:
    return bool(_deephat_key() or os.getenv("DEEPHAT_BASE_URL", "").strip())


def _deephat_model() -> str:
    configured = os.getenv("DEEPHAT_MODEL", "").strip()
    if configured:
        return configured
    url = _deephat_base_url()
    if any(token in url for token in ("trycloudflare.com", "ngrok", ":11434")):
        return "deephat"
    return "DeepHat/DeepHat-V1-7B"


def _deephat_client() -> OpenAI:
    key = _deephat_key() or "ollama"
    return OpenAI(api_key=key, base_url=_deephat_base_url())


_NO_NATIVE_TOOLS = (
    "\n\nRECORDATORIO: no uses function calling ni tool_calls nativos. "
    "Respondé solo en texto plano (con bloques ```json de texto si hace falta "
    "usar una herramienta del protocolo, nunca una llamada de función real)."
)


def _tool_calls_to_protocol(message) -> str:
    tcs = getattr(message, "tool_calls", None) or []
    parts: list[str] = []
    for tc in tcs:
        fn = getattr(tc, "function", None)
        if fn is None and isinstance(tc, dict):
            fn = tc.get("function") or tc
        if fn is None:
            continue
        if isinstance(fn, dict):
            name = str(fn.get("name") or "").lower()
            raw_args = fn.get("arguments") or "{}"
        else:
            name = str(getattr(fn, "name", "") or "").lower()
            raw_args = getattr(fn, "arguments", "") or "{}"
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else (raw_args or {})
        except Exception:
            args = {"raw": str(raw_args)}
        if not isinstance(args, dict):
            args = {"raw": str(args)}
        if name in {"python", "run_python", "code_execution", "code", "execute_python"}:
            payload = {"tool": "python", "code": args.get("code") or args.get("source") or args.get("raw") or ""}
        elif name in {"bash", "shell", "run", "terminal", "command"}:
            payload = {"tool": "bash", "cmd": args.get("cmd") or args.get("command") or args.get("raw") or ""}
        elif name in {"fetch", "web_fetch", "http_get"}:
            payload = {"tool": "fetch", "url": args.get("url") or args.get("raw") or ""}
        else:
            payload = {"tool": name or "bash", **args}
        parts.append("```json\n" + json.dumps(payload, ensure_ascii=False) + "\n```")
    return "\n".join(parts)


def _deephat_reply(messages: list[dict], temperature: float = 0.4) -> str:
    model = _deephat_model()
    api = _deephat_client()

    def _call(msgs, *, forbid_native: bool):
        kwargs = {"model": model, "messages": msgs, "temperature": temperature}
        if forbid_native:
            kwargs["tools"] = []
            kwargs["tool_choice"] = "none"
        response = api.chat.completions.create(**kwargs)
        message = response.choices[0].message
        converted = _tool_calls_to_protocol(message)
        if converted:
            return converted
        content = (getattr(message, "content", None) or "").strip()
        if not content:
            raise RuntimeError("el modelo respondió vacío (intentó una tool call nativa)")
        return content

    try:
        return _call(messages, forbid_native=False)
    except Exception as exc:
        record_llm_error("deephat", "llamada inicial", exc)
        retry_messages = list(messages) + [
            {"role": "system", "content": _NO_NATIVE_TOOLS.strip()}
        ]
        try:
            return _call(retry_messages, forbid_native=True)
        except Exception as exc2:
            record_llm_error("deephat", "reintento", exc2)
            try:
                return _call(retry_messages, forbid_native=False)
            except Exception as exc3:
                record_llm_error("deephat", "reintento sin flags", exc3)
                raise


def resolve_provider(explicit: str | None = None) -> str:
    """Por ahora el único cerebro activo es DeepHat."""
    if not _deephat_ready():
        raise RuntimeError(
            "DeepHat no está configurado: falta DEEPHAT_BASE_URL "
            "(URL de Ngrok/Colab con /v1) o DEEPHAT_API_KEY"
        )
    return "deephat"


def reply_messages(messages: list[dict], temperature: float = 0.4) -> str:
    return _deephat_reply(messages, temperature=temperature)


FRIENDLY_FAIL = (
    "No pude hablar con DeepHat. Si Colab o Ngrok se cayeron, levantá el runtime "
    "y actualizá DEEPHAT_BASE_URL en Fly."
)

DEEPHAT_FAIL = FRIENDLY_FAIL


def reply(
    instructions: str,
    history: list[dict],
    *,
    provider: str | None = None,
    scope: str = "default",
) -> str:
    if not _deephat_ready():
        LAST_PROVIDER.set("error")
        return DEEPHAT_FAIL
    messages = [{"role": "system", "content": instructions}]
    for item in history[-30:]:
        role = item.get("role")
        if role in {"user", "assistant"} and item.get("content"):
            messages.append({"role": role, "content": item["content"]})
    try:
        text = _deephat_reply(messages)
        LAST_PROVIDER.set("deephat")
        return text
    except Exception as exc:
        record_llm_error("deephat", "principal", exc)
        LAST_PROVIDER.set("error")
        return DEEPHAT_FAIL


def reply_messages_routed(
    messages: list[dict],
    temperature: float = 0.4,
    *,
    provider: str | None = None,
    scope: str = "default",
    instructions: str = "",
) -> str:
    if not _deephat_ready():
        LAST_PROVIDER.set("error")
        return DEEPHAT_FAIL
    try:
        text = _deephat_reply(messages, temperature=temperature)
        LAST_PROVIDER.set("deephat")
        return text
    except Exception as exc:
        record_llm_error("deephat", "group", exc)
        LAST_PROVIDER.set("error")
        return DEEPHAT_FAIL
