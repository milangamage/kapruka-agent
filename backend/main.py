"""
main.py
-------
FastAPI server for the Kapruka AI Sales Agent.

Endpoints:
  GET  /                          → Status check
  GET  /health                    → Detailed health + stats
  POST /api/chat                  → Main chat endpoint
  DELETE /api/session/{id}        → Clear a session
  GET  /api/sessions              → List all sessions (dashboard)
  GET  /api/sessions/{id}         → Full conversation for one session
  GET  /api/stats                 → Aggregate stats for dashboard
"""

import os
import uuid
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from agent import KaprukaAgent

load_dotenv()

# ── Data structures ───────────────────────────────────────────────────────────

class SessionMeta:
    """Tracks metadata for each conversation session."""
    def __init__(self, session_id: str):
        self.session_id    = session_id
        self.created_at    = datetime.now(timezone.utc)
        self.last_active   = datetime.now(timezone.utc)
        self.message_count = 0
        self.messages: list[dict] = []   # Full conversation history

    def add_message(self, role: str, content: str):
        self.messages.append({
            "role":    role,
            "content": content,
            "time":    datetime.now(timezone.utc).isoformat(),
        })
        self.message_count += 1
        self.last_active    = datetime.now(timezone.utc)

    def to_summary(self) -> dict:
        last_msg = self.messages[-1] if self.messages else None
        return {
            "session_id":    self.session_id,
            "created_at":    self.created_at.isoformat(),
            "last_active":   self.last_active.isoformat(),
            "message_count": self.message_count,
            "last_message":  last_msg["content"][:120] if last_msg else "",
            "last_role":     last_msg["role"] if last_msg else "",
        }

    def to_full(self) -> dict:
        return {**self.to_summary(), "messages": self.messages}


# ── In-memory store ───────────────────────────────────────────────────────────
sessions: dict[str, SessionMeta] = {}
agent: KaprukaAgent | None = None
total_messages_served = 0       # running counter across all sessions


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set in .env")

    agent = KaprukaAgent(api_key=api_key)
    await agent.initialize()
    print("\n🚀 Kapruka AI Sales Agent is LIVE!\n")
    yield
    print("👋 Shutting down...")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Kapruka AI Sales Agent",
    description="GPT-4o powered AI sales agent for Kapruka.com",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ───────────────────────────────────────────────────────────
class ChatRequest(BaseModel):
    message:    str
    session_id: str | None = None

class ChatResponse(BaseModel):
    reply:      str
    session_id: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "online", "agent": "Kapruka AI Sales Agent", "version": "1.0.0"}


@app.get("/health")
async def health():
    return {
        "status":               "healthy",
        "tools_loaded":         len(agent.tools) if agent else 0,
        "active_sessions":      len(sessions),
        "total_messages_served": total_messages_served,
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    global total_messages_served

    if not agent:
        raise HTTPException(503, "Agent is still initialising.")
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty.")

    # Get or create session
    sid  = request.session_id or str(uuid.uuid4())
    meta = sessions.get(sid)
    if not meta:
        meta = SessionMeta(sid)
        sessions[sid] = meta

    # Record incoming user message
    meta.add_message("user", request.message)

    print(f"\n💬 [{sid[:8]}] User: {request.message}")

    try:
        # Build plain history list for the agent (role + content only)
        # Map 'agent' → 'assistant' because OpenAI only accepts 'assistant', not 'agent'
        history = [
            {"role": "assistant" if m["role"] == "agent" else m["role"], "content": m["content"]}
            for m in meta.messages[:-1]
        ]
        reply, _ = await agent.chat(request.message, history)

        # Record agent reply
        meta.add_message("agent", reply)
        total_messages_served += 1

        print(f"🤖 [{sid[:8]}] Agent: {reply[:100]}{'...' if len(reply)>100 else ''}")

        return ChatResponse(reply=reply, session_id=sid)

    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(500, f"Agent error: {str(e)}")


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    sessions.pop(session_id, None)
    return {"status": "cleared", "session_id": session_id}


@app.get("/api/sessions")
async def list_sessions():
    """Return summary of all sessions — used by the dashboard list view."""
    sorted_sessions = sorted(
        sessions.values(),
        key=lambda s: s.last_active,
        reverse=True
    )
    return {
        "active_sessions": len(sessions),
        "sessions": [s.to_summary() for s in sorted_sessions],
    }


@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Return full conversation for a session — used by the dashboard detail view."""
    meta = sessions.get(session_id)
    if not meta:
        raise HTTPException(404, "Session not found.")
    return meta.to_full()


@app.get("/api/stats")
async def stats():
    """Aggregate stats for the dashboard header cards."""
    total_msgs  = sum(s.message_count for s in sessions.values())
    user_msgs   = sum(
        sum(1 for m in s.messages if m["role"] == "user")
        for s in sessions.values()
    )
    return {
        "active_sessions":        len(sessions),
        "total_messages":         total_msgs,
        "user_messages":          user_msgs,
        "total_messages_served":  total_messages_served,
        "tools_available":        len(agent.tools) if agent else 0,
    }
