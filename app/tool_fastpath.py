"""Si el modelo se cae, igual ejecutamos cuentas simples con Python."""
from __future__ import annotations

import json
import re

_CALC = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*([+\-*/x×])\s*(\d+(?:[.,]\d+)?)"
)
_WANT = re.compile(r"python|calcul|çcódigo|codigo|suma|resta|multipl|divid", re.I)


def infer_python_tool(user_text: str) -> dict | None:
    text = user_text or ""
    if not _WANT.search(text):
        return None
    m = _CALC.search(text.replace("x", "*"))
    if not m:
        return None
    a, op, b = m.group(1), m.group(2), m.group(3)
    a, b = a.replace(",", "."), b.replace(",", ".")
    op = {"x": "*", "×": "*"}.get(op, op)
    return {"tool": "python", "code": f"print({a} {op} {b})"}


def _last_user(history: list | None) -> str:
    for item in reversed(history or []):
        if item.get("role") != "user":
            continue
        raw = str(item.get("content") or "")
        if raw.startswith("RESULTADO DE TU COMPUTADORA"):
            continue
        return raw
    return ""


def _tool_block(tool: dict) -> str:
    return "```json\n" + json.dumps(tool, ensure_ascii=False) + "\n```"


def _from_computer_note(history: list | None) -> str | None:
    for item in reversed(history or []):
        raw = str(item.get("content") or "")
        if raw.startswith("RESULTADO DE TU COMPUTADORA"):
            body = raw.split("\n\n", 1)[0]
            body = body.replace("RESULTADO DE TU COMPUTADORA:", "").strip()
            out = ""
            if "stdout:" in body:
                out = body.split("stdout:", 1)[-1].strip().split("stderr:")[0].strip()
            return out or body[:400]
    return None


def install() -> None:
    from app import llm

    if getattr(llm.reply, "_fastpath", False):
        return
    orig = llm.reply
    fails = {getattr(llm, "FRIENDLY_FAIL", ""), getattr(llm, "DEEPHAT_FAIL", "")}

    def reply(instructions, history, **kwargs):
        text = orig(instructions, history, **kwargs)
        if text not in fails and text:
            return text
        note = _from_computer_note(history)
        if note:
            return note
        tool = infer_python_tool(_last_user(history))
        if tool:
            return _tool_block(tool)
        return text

    reply._fastpath = True
    llm.reply = reply
