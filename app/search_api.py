from __future__ import annotations


def register(app) -> None:
    from app.store import list_groups, list_specialists, load_messages

    @app.get("/api/search")
    def api_search(q: str = ""):
        needle = (q or "").strip().lower()
        items = []
        if len(needle) < 2:
            return {"ok": True, "items": []}
        for spec in list_specialists():
            sid = spec.get("id")
            name = spec.get("name") or "Agente"
            blob = (name + " " + (spec.get("title") or "")).lower()
            if needle in blob:
                items.append({
                    "kind": "agent",
                    "id": sid,
                    "agent": name,
                    "text": spec.get("title") or "Agente",
                })
            try:
                msgs = load_messages(sid) or []
            except Exception:
                msgs = []
            for msg in msgs[-80:]:
                text = str(msg.get("content") or "")
                if needle in text.lower() and not text.startswith("RESULTADO DE TU COMPUTADORA"):
                    snippet = text.replace("\n", " ")[:140]
                    items.append({
                        "kind": "msg",
                        "id": sid,
                        "agent": name,
                        "text": snippet,
                    })
                    if len(items) >= 40:
                        return {"ok": True, "items": items}
        for group in list_groups():
            gname = (group.get("name") or "Grupo")
            if needle in gname.lower() or needle in str(group.get("task") or "").lower():
                items.append({
                    "kind": "group",
                    "id": group.get("id"),
                    "agent": gname,
                    "text": group.get("task") or "Grupo",
                })
        return {"ok": True, "items": items[:40]}
