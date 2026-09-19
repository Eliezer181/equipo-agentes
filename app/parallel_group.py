from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

from fastapi.routing import APIRoute


def install() -> None:
    from app import main

    orig = main.api_group_chat

    def api_group_chat(group_id: str, payload, request):
        user = main._current_user(request)
        if user and main.users_auth.credits_exhausted(user):
            from fastapi import HTTPException
            raise HTTPException(
                status_code=402,
                detail={"error_code": "credits_exhausted", "message": "Se agotaron tus créditos"},
            )
        group = main.get_group(group_id)
        if not group:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="No existe ese grupo")
        if not group.get("members"):
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="El grupo no tiene integrantes")
        main._PROVIDER.set(payload.provider)
        user_text = payload.message.strip()
        target = main.speakers_for(group, payload)
        reply_name = target[0]["name"] if payload.reply_to and target else ""
        group.setdefault("messages", []).append({
            "sender": group["leader"],
            "role": "user",
            "content": user_text,
            "at": main._now(),
            "reply_to": payload.reply_to,
            "reply_to_name": reply_name,
        })
        replies = []
        spoken: set[str] = set()
        last_error = None
        bag = threading.Lock()

        def add_reply(member: dict, turn: dict, quote_name: str = "") -> str:
            nonlocal last_error
            try:
                text = main._speak(member, group, turn)
            except Exception as exc:
                last_error = exc
                return ""
            if not text:
                return ""
            text = main.attach_media(user_text, text)
            msg = {
                "sender": member["name"],
                "member_id": member["id"],
                "role": "assistant",
                "content": text,
                "at": main._now(),
                "color": member.get("color", "#f97316"),
                "reply_to": member["id"],
                "reply_to_name": quote_name,
            }
            with bag:
                group["messages"].append(msg)
                replies.append(msg)
                spoken.add(member["id"])
            return text

        workers = min(6, max(1, len(target)))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = []
            for member in target:
                turn = {"task": user_text, "address": group["leader"]}
                if payload.reply_to and member["name"] == reply_name:
                    turn["task"] = f"{group['leader']} te respondió: {user_text}"
                futs.append(pool.submit(add_reply, member, turn, reply_name))
            for fut in as_completed(futs):
                fut.result()

        pending = []
        snapshot = list(replies)
        for msg in snapshot:
            for other in group["members"]:
                if other["id"] in spoken:
                    continue
                if f"@{other['name'].lower()}" in (msg.get("content") or "").lower():
                    pending.append((other, msg["sender"]))
        if pending:
            with ThreadPoolExecutor(max_workers=min(6, len(pending))) as pool:
                futs = [
                    pool.submit(add_reply, other, {
                        "task": f"{who} te habló. Respondéle a {who}.",
                        "address": who,
                    }, who)
                    for other, who in pending
                    if other["id"] not in spoken
                ]
                for fut in as_completed(futs):
                    fut.result()

        main.save_group(group)
        if not replies:
            from fastapi import HTTPException
            raise HTTPException(status_code=500, detail=str(last_error or "Nadie pudo responder"))
        from app.llm import LAST_PROVIDER
        provider_used = LAST_PROVIDER.get()
        if user:
            try:
                charge = 0.1 * max(1, len(replies))
                main.users_auth.deduct_credits(user["email"], charge)
            except Exception:
                pass
        return {"replies": replies, "messages": group["messages"], "provider": provider_used}

    # anotaciones reales para que FastAPI parsee payload como body (no query)
    from fastapi import Request as _Request
    api_group_chat.__annotations__ = {"group_id": str, "payload": main.ChatIn, "request": _Request}

    for route in list(main.app.router.routes):
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", set()) or set()
        if path == "/api/groups/{group_id}/chat" and "POST" in methods and isinstance(route, APIRoute):
            new_route = APIRoute(path, api_group_chat, methods=["POST"], name=route.name)
            main.app.router.routes.remove(route)
            main.app.router.routes.append(new_route)
            break
