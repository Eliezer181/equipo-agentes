from fastapi import Request
from app.main import ChatIn, app
from app.async_chat import handle_chat


@app.post("/api/agent-chat/{specialist_id}")
def api_agent_chat(specialist_id: str, payload: ChatIn, request: Request):
    return handle_chat(specialist_id, payload, request)
