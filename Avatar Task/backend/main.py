"""
AI Virtual Avatar Assistant — FastAPI Backend
Handles: Chat (with history), Translation, Health checks
"""
import os
import uuid
from pathlib import Path
from typing import List, Optional

import httpx
from dotenv import load_dotenv
from groq import Groq
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b")

# LiveAvatar configuration
LIVEAVATAR_API_KEY = os.getenv("LIVEAVATAR_API_KEY")
LIVEAVATAR_AVATAR_ID = os.getenv("LIVEAVATAR_AVATAR_ID", "cef6194c-b58d-41dc-8410-c39e344b0313")
LIVEAVATAR_SANDBOX = os.getenv("LIVEAVATAR_SANDBOX", "false").lower() == "true"
LIVEAVATAR_BASE_URL = "https://api.liveavatar.com/v1"

print(f"[INFO] Using Groq model: {GROQ_MODEL}")
print(f"[INFO] LiveAvatar configured: {bool(LIVEAVATAR_API_KEY and LIVEAVATAR_AVATAR_ID)}")

groq_client: Optional[Groq] = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

# ---------------------------------------------------------------------------
# In-memory conversation store  {session_id: [messages]}
# ---------------------------------------------------------------------------
MAX_HISTORY = 20          # max messages kept per session
MAX_HISTORY_TOKENS = 2000 # rough character budget (keep last N chars of history)

sessions: dict[str, List[dict]] = {}

# ---------------------------------------------------------------------------
# Language configuration
# ---------------------------------------------------------------------------
SUPPORTED_LANGUAGES = {
    "en": {"name": "English",   "bcp47": "en-US"},
    "ta": {"name": "Tamil",     "bcp47": "ta-IN"},
    "hi": {"name": "Hindi",     "bcp47": "hi-IN"},
    "te": {"name": "Telugu",    "bcp47": "te-IN"},
    "ml": {"name": "Malayalam", "bcp47": "ml-IN"},
    "kn": {"name": "Kannada",   "bcp47": "kn-IN"},
    "es": {"name": "Spanish",   "bcp47": "es-ES"},
}

SYSTEM_PROMPT_BASE = (
    "You are Steve, a professional, articulate, and friendly AI virtual assistant with a 3D human avatar. "
    "Your name is Steve. Whenever the user addresses you as Steve (such as 'Steve', 'Hey Steve', 'Hi Steve', "
    "or asks 'Steve, can you...', 'Steve what is...'), acknowledge your name naturally and answer their question "
    "directly, intelligently, and concisely (2–4 conversational sentences unless more detail is requested). "
    "Always be helpful, warm, and confident as Steve. Never break character."
)

LANGUAGE_INSTRUCTIONS = {
    "en": "Respond only in English.",
    "ta": "Respond only in Tamil (தமிழ் மட்டும் பயன்படுத்தவும்).",
    "hi": "Respond only in Hindi (केवल हिंदी में उत्तर दें).",
    "te": "Respond only in Telugu (తెలుగులో మాత్రమే సమాధానం ఇవ్వండి).",
    "ml": "Respond only in Malayalam (മലയാളത്തിൽ മാത്രം ഉത്തരം നൽകുക).",
    "kn": "Respond only in Kannada (ಕನ್ನಡದಲ್ಲಿ ಮಾತ್ರ ಉತ್ತರಿಸಿ).",
    "es": "Responde solo en español.",
}

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="AI Avatar Assistant API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    language: str = "en"             # ISO 639-1 code


class TranslateRequest(BaseModel):
    text: str
    source_language: str = "en"      # ISO 639-1 code
    target_language: str = "en"      # ISO 639-1 code


class NewSessionResponse(BaseModel):
    session_id: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def build_system_prompt(language: str) -> str:
    lang_instruction = LANGUAGE_INSTRUCTIONS.get(
        language, "Respond in the same language as the user's message."
    )
    return f"{SYSTEM_PROMPT_BASE} {lang_instruction}"


def trim_history(history: List[dict]) -> List[dict]:
    """Keep only the last MAX_HISTORY messages."""
    return history[-MAX_HISTORY:]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.get("/")
async def home():
    return {"message": "AI Avatar Assistant Backend v2.0 is running!"}


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "groq_configured": bool(groq_client),
        "groq_model": GROQ_MODEL,
        "liveavatar_configured": bool(LIVEAVATAR_API_KEY and LIVEAVATAR_AVATAR_ID),
        "liveavatar_avatar_id": LIVEAVATAR_AVATAR_ID,
        "supported_languages": list(SUPPORTED_LANGUAGES.keys()),
    }


@app.post("/api/avatar/session")
async def create_avatar_session():
    """Create a LiveAvatar streaming session token for the real Steve avatar."""
    if not LIVEAVATAR_API_KEY or not LIVEAVATAR_AVATAR_ID:
        raise HTTPException(
            status_code=500,
            detail="LiveAvatar API key or Avatar ID is missing in .env"
        )

    headers = {
        "X-API-KEY": LIVEAVATAR_API_KEY,
        "Content-Type": "application/json"
    }

    token_payload = {
        "mode": "LITE",
        "is_sandbox": LIVEAVATAR_SANDBOX,
        "avatar_id": LIVEAVATAR_AVATAR_ID
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{LIVEAVATAR_BASE_URL}/sessions/token",
                headers=headers,
                json=token_payload
            )
            response.raise_for_status()
            result = response.json()
            data = result.get("data", result)
            session_token = data.get("session_token")
            session_id = data.get("session_id")

            if not session_token:
                raise HTTPException(
                    status_code=502,
                    detail="Session token missing from LiveAvatar response"
                )

            return {
                "success": True,
                "session_token": session_token,
                "session_id": session_id,
                "avatar_id": LIVEAVATAR_AVATAR_ID,
                "message": "LiveAvatar session token created"
            }
        except httpx.HTTPStatusError as error:
            print("LiveAvatar API error:", error.response.text)
            raise HTTPException(
                status_code=error.response.status_code,
                detail=f"LiveAvatar API rejected request: {error.response.text}"
            )
        except Exception as error:
            print("LiveAvatar connection error:", repr(error))
            raise HTTPException(
                status_code=502,
                detail="Could not connect to LiveAvatar API"
            )


@app.post("/api/session/new", response_model=NewSessionResponse)
async def new_session():
    """Create a new conversation session and return its ID."""
    session_id = str(uuid.uuid4())
    sessions[session_id] = []
    return {"session_id": session_id}


@app.delete("/api/session/{session_id}")
async def clear_session(session_id: str):
    """Clear a session's conversation history."""
    sessions.pop(session_id, None)
    return {"success": True, "message": "Session cleared."}


@app.post("/api/chat")
async def chat(request: ChatRequest):
    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq API key is not configured.")

    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    language = request.language if request.language in SUPPORTED_LANGUAGES else "en"

    # Retrieve or create session history
    session_id = request.session_id or str(uuid.uuid4())
    if session_id not in sessions:
        sessions[session_id] = []

    history = sessions[session_id]

    # Add the new user message
    history.append({"role": "user", "content": request.message})
    history = trim_history(history)

    # Build the full messages list for Groq
    messages = [
        {"role": "system", "content": build_system_prompt(language)},
        *history,
    ]

    try:
        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=600,
        )

        reply = response.choices[0].message.content

        # Store assistant reply in history
        history.append({"role": "assistant", "content": reply})
        sessions[session_id] = trim_history(history)

        return {
            "success": True,
            "reply": reply,
            "session_id": session_id,
            "language": language,
        }

    except Exception as error:
        print("Groq API error:", repr(error))
        raise HTTPException(status_code=500, detail="AI response generation failed.")


@app.post("/api/translate")
async def translate(request: TranslateRequest):
    """Translate text between supported languages using Groq."""
    if not groq_client:
        raise HTTPException(status_code=500, detail="Groq API key is not configured.")

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    source_name = SUPPORTED_LANGUAGES.get(
        request.source_language, {"name": request.source_language}
    )["name"]
    target_name = SUPPORTED_LANGUAGES.get(
        request.target_language, {"name": request.target_language}
    )["name"]

    prompt = (
        f"Translate the following text from {source_name} to {target_name}. "
        f"Output ONLY the translated text, nothing else.\n\n"
        f"Text: {request.text}"
    )

    try:
        response = groq_client.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a professional translator. "
                        "Translate accurately and naturally. "
                        "Output only the translated text, with no extra commentary."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=400,
        )

        translation = response.choices[0].message.content.strip()

        return {
            "success": True,
            "original": request.text,
            "translation": translation,
            "source_language": request.source_language,
            "target_language": request.target_language,
        }

    except Exception as error:
        print("Translation error:", repr(error))
        raise HTTPException(status_code=500, detail="Translation failed.")


@app.get("/api/languages")
async def get_languages():
    """Return the list of supported languages."""
    return {"languages": SUPPORTED_LANGUAGES}
