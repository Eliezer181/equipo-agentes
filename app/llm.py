from __future__ import annotations

import os
from contextvars import ContextVar

from openai import OpenAI

from app import base44_client

LAST_PROVIDER: ContextVar[str] = ContextVar("last_llm_provider", default="gemini")

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


def _keys() -> tuple[str, str]:
    gemini = os.getenv("GEMINI_API_KEY", "").strip()
    xai = os.getenv("XAI_API_KEY", "").strip()
    return gemini, xai


def _is_xai(key: str) -> bool:
    return key.startswith("xai-")


def _using_gemini() -> bool:
    gemini, xai = _keys()
    return bool(gemini or (xai and not _is_xai(xai)))


def client() -> OpenAI:
    gemini, xai = _keys()
    if gemini:
        return OpenAI(api_key=gemini, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))
    if xai and not _is_xai(xai):
        return OpenAI(api_key=xai, base_url=os.getenv("GEMINI_BASE_URL", GEMINI_URL))
    if xai:
        return OpenAI(api_key=xai, base_url=os.getenv("XAI_BASE_URL", XAI_URL))
    raise RuntimeError("Falta GEMINI_API_KEY (o XAI_API_KEY con la clave de Gemini).")


def _models() -> list[str]:
    """Orden de modelos a probar.

    Los modelos Gemini van primero: siguen mejor las instrucciones de
    personalidad en chats grupales (varios agentes con identidades propias).
    Un MODEL configurado manualmente (por ej. un modelo chico/gratuito como
    gpt-oss-20b) queda como último fallback, no como primera opción, porque
    los modelos chicos tienden a confundir identidades entre agentes."""
    configured = os.getenv("MODEL", "").strip()
    if not _using_gemini():
        return [configured or "grok-4.3"]
    out: list[str] = list(GEMINI_MODELS)
    if configured and configured not in out:
        out.append(configured)
    return out


def _deephat_key() -> str:
    return os.getenv("DEEPHAT_API_KEY", "").strip()


def _deephat_base_url() -> str:
    return os.getenv("DEEPHAT_BASE_URL", "").strip() or DEEPHAT_URL


def _deephat_ready() -> bool:
    """Deep Hat está disponible con API key (HF router) o con servidor propio (Ollama vía túnel)."""
    return bool(_deephat_key() or os.getenv("DEEPHAT_BASE_URL", "").strip())


def _deephat_model() -> str:
    configured = os.getenv("DEEPHAT_MODEL", "").strip()
    if configured:
        return configured
    # Servidor propio (Ollama en Colab): el modelo se llama "deephat"
    if "trycloudflare.com" in _deephat_base_url() or ":11434" in _deephat_base_url():
        return "deephat"
    return "DeepHat/DeepHat-V1-7B"


def _deephat_client() -> OpenAI:
    key = _deephat_key() or "ollama"  # Ollama no valida la key, OpenAI client exige una
    return OpenAI(api_key=key, base_url=_deephat_base_url())


_NO_NATIVE_TOOLS = (
    "\n\nRECORDATORIO: no uses function calling ni tool_calls nativos. "
    "Respondé solo en texto plano (con bloques ```json de texto si hace falta "
    "usar una herramienta del protocolo, nunca una llamada de función real)."
)


def _deephat_reply(messages: list[dict], temperature: float = 0.4) -> str:
    model = _deephat_model()
    api = _deephat_client()
    try:
        response = api.chat.completions.create(
            model=model, messages=messages, temperature=temperature, tools=[], tool_choice="none",
        )
        return (response.choices[0].message.content or "").strip()
    except Exception as exc:
        # El modelo suele intentar una tool call nativa (no soportada por este
        # protocolo) y el servidor la rechaza con 400. Reintentamos una vez
        # reforzando que responda solo en texto plano antes de rendirnos.
        text = str(exc).lower()
        if "tool" not in text and "parse" not in text:
            raise
        retry_messages = list(messages) + [
            {"role": "system", "content": _NO_NATIVE_TOOLS.strip()}
        ]
        response = api.chat.completions.create(
            model=model, messages=retry_messages, temperature=temperature, tools=[], tool_choice="none",
        )
        return (response.choices[0].message.content or "").strip()


def resolve_provider(explicit: str | None = None) -> str:
    """Base44 first when enabled; Gemini otherwise or when explicitly requested.

    Default order (Jefe): Base44 → fallback Gemini. Override with LLM_PROVIDER
    or per-request provider=gemini|base44.
    """
    raw = (explicit if explicit is not None else os.getenv("LLM_PROVIDER", "")).strip().lower()
    if raw in {"gemini", "google"}:
        return "gemini"
    if raw in {"deephat", "deep-hat", "hat"}:
        if not _deephat_ready():
            raise RuntimeError(
                "Deep Hat pedido pero falta DEEPHAT_API_KEY o DEEPHAT_BASE_URL "
                "(token de HuggingFace o URL del servidor Ollama propio)"
            )
        return "deephat"
    if raw in {"base44", "base-44", "b44"}:
        if not base44_client.enabled():
            raise RuntimeError(
                "Base44 pedido pero no está listo: seteá BASE44_ENABLED=1, "
                "BASE44_API_KEY y BASE44_BASE_URL"
            )
        return "base44"
    # No explicit choice: prefer Base44 when configured, else Gemini
    if base44_client.enabled():
        return "base44"
    return "gemini"


def reply_messages(messages: list[dict], temperature: float = 0.4) -> str:
    """Prueba los modelos en orden hasta que uno responda."""
    last_error = None
    api = client()
    for model in _models():
        try:
            response = api.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
            )
            return (response.choices[0].message.content or "").strip()
        except Exception as exc:
            last_error = exc
            text = str(exc).lower()
            if any(marker in text for marker in RETRYABLE):
                continue
            raise
    raise last_error or RuntimeError("No se pudo usar ningún modelo")


def _gemini_from_history(instructions: str, history: list[dict]) -> str:
    messages = [{"role": "system", "content": instructions}]
    for item in history[-30:]:
        role = item.get("role")
        if role in {"user", "assistant"} and item.get("content"):
            messages.append({"role": role, "content": item["content"]})
    return reply_messages(messages)


FRIENDLY_FAIL = (
    "Se me complicó conectar con el modelo (ida y vuelta de herramientas "
    "que no cerró bien). Probá de nuevo en un segundo, por favor."
)


def _safe_gemini_from_history(instructions: str, history: list[dict]) -> str | None:
    try:
        return _gemini_from_history(instructions, history)
    except Exception:
        return None


def _safe_reply_messages(messages: list[dict], temperature: float = 0.4) -> str | None:
    try:
        return reply_messages(messages, temperature=temperature)
    except Exception:
        return None


def reply(
    instructions: str,
    history: list[dict],
    *,
    provider: str | None = None,
    scope: str = "default",
) -> str:
    if resolve_provider(provider) == "base44":
        try:
            text = base44_client.reply(instructions, history, scope=scope)
            LAST_PROVIDER.set("base44")
            return text
        except Exception:
            # Fallback to Gemini; never leak Base44 auth details to callers.
            text = _safe_gemini_from_history(instructions, history)
            LAST_PROVIDER.set("gemini_fallback" if text else "error")
            return text or FRIENDLY_FAIL
    if resolve_provider(provider) == "deephat":
        messages = [{"role": "system", "content": instructions}]
        for item in history[-30:]:
            role = item.get("role")
            if role in {"user", "assistant"} and item.get("content"):
                messages.append({"role": role, "content": item["content"]})
        try:
            text = _deephat_reply(messages)
            LAST_PROVIDER.set("deephat")
            return text
        except Exception:
            # Fallback a Gemini; nunca filtrar detalles de auth de Deep Hat.
            text = _safe_gemini_from_history(instructions, history)
            LAST_PROVIDER.set("gemini_fallback" if text else "error")
            return text or FRIENDLY_FAIL
    LAST_PROVIDER.set("gemini")
    return _safe_gemini_from_history(instructions, history) or FRIENDLY_FAIL


def reply_messages_routed(
    messages: list[dict],
    temperature: float = 0.4,
    *,
    provider: str | None = None,
    scope: str = "default",
    instructions: str = "",
) -> str:
    """Group chats build OpenAI-style messages; map to Base44 when selected."""
    if resolve_provider(provider) == "base44":
        system_parts = []
        history: list[dict] = []
        for m in messages:
            role = m.get("role")
            content = (m.get("content") or "").strip()
            if not content:
                continue
            if role == "system":
                system_parts.append(content)
            elif role in {"user", "assistant"}:
                history.append({"role": role, "content": content})
        instr = instructions or "\n\n".join(system_parts) or "Sos un especialista del equipo."
        try:
            text = base44_client.reply(instr, history, scope=scope)
            LAST_PROVIDER.set("base44")
            return text
        except Exception:
            text = _safe_reply_messages(messages, temperature=temperature)
            LAST_PROVIDER.set("gemini_fallback" if text else "error")
            return text or FRIENDLY_FAIL
    if resolve_provider(provider) == "deephat":
        try:
            text = _deephat_reply(messages, temperature=temperature)
            LAST_PROVIDER.set("deephat")
            return text
        except Exception:
            text = _safe_reply_messages(messages, temperature=temperature)
            LAST_PROVIDER.set("gemini_fallback" if text else "error")
            return text or FRIENDLY_FAIL
    LAST_PROVIDER.set("gemini")
    return _safe_reply_messages(messages, temperature=temperature) or FRIENDLY_FAIL
