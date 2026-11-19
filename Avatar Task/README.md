# ARIA — AI Virtual Avatar Assistant

A production-quality multilingual 3D AI virtual assistant with realistic lip synchronization, voice input/output, and a live interpreter mode.

---

## Features

| Feature | Status | Notes |
|---|---|---|
| **Realistic Steve Avatar** | ✅ | Photorealistic avatar from office photo + LiveAvatar WebRTC video stream |
| **3D VRM Steve Avatar** | ✅ | Rocketbox 3D model with natural resting arms & studio lighting |
| **Hands-Free Wake Word** | ✅ | Say *"Steve"* or *"Hey Steve"* to automatically turn on mic and ask questions |
| Realistic lip sync | ✅ | Word-timed viseme animation via boundary events + audio cadence |
| AI chat (Groq) | ✅ | Conversation history, multilingual system prompts, Steve persona |
| Voice input | ✅ | Web Speech API with live transcript across 7 languages |
| Text-to-speech | ✅ | Browser SpeechSynthesis with language-specific voice selection |
| 7 languages | ✅ | English, Tamil, Hindi, Telugu, Malayalam, Kannada, Spanish |
| Live interpreter | ✅ | Speak in source language → translate → speak in target language |
| Settings panel | ✅ | Speech speed, pitch, volume, voice list |
| New conversation | ✅ | Clears history on frontend and backend |
| Backend health check | ✅ | Auto-ping every 15 seconds |
| Responsive layout | ✅ | Desktop, tablet, mobile |

---

## Requirements

- **Windows** (tested on Windows 10/11)
- **Node.js** v18+ and npm
- **Python** 3.10+
- A modern browser (Chrome or Edge recommended for best voice support)
- A free **Groq API key**: https://console.groq.com

---

## Quick Start

### Option A — Batch file (easiest)
Double-click `start.bat` in the project root.

### Option B — PowerShell script
```powershell
cd "D:\INTERN 1 folder\16.11.2026- Avatar"
.\start.ps1
```

### Option C — Manual (two separate terminals)

**Terminal 1 — Backend:**
```powershell
cd "D:\INTERN 1 folder\16.11.2026- Avatar\backend"
.\.venv\Scripts\uvicorn.exe main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — Frontend:**
```powershell
cd "D:\INTERN 1 folder\16.11.2026- Avatar\frontend"
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## Configuration

### Backend environment (backend/.env)
```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

See `backend/.env.example` for reference. Never commit `.env` to version control.

### Available Groq models (for this account)
- `openai/gpt-oss-20b` — currently configured
- `openai/gpt-oss-120b` — larger model
- `qwen/qwen3.8-27b` — alternative

---

## Project Structure

```
16.11.2026- Avatar/
├── start.bat                   ← Double-click to start both servers
├── start.ps1                   ← PowerShell start script
├── backend/
│   ├── main.py                 ← FastAPI backend (main file)
│   ├── requirements.txt        ← Python dependencies
│   ├── .env                    ← Your API keys (do not commit)
│   ├── .env.example            ← Template (safe to commit)
│   └── .venv/                  ← Python virtual environment
└── frontend/
    ├── src/
    │   ├── App.jsx             ← Root component, layout, mode switching
    │   ├── App.css             ← Complete dark theme stylesheet
    │   ├── store/
    │   │   └── appStore.js     ← Global state (Zustand)
    │   ├── hooks/
    │   │   ├── useSpeech.js    ← TTS + viseme/lip-sync engine
    │   │   ├── useVoiceInput.js← Speech recognition
    │   │   └── useChat.js      ← Backend API calls
    │   └── components/
    │       ├── Avatar3D.jsx    ← Three.js + VRM avatar renderer
    │       ├── AvatarStatus.jsx← State indicator overlay
    │       ├── ChatPanel.jsx   ← Chat UI with voice input
    │       ├── InterpreterPanel.jsx ← Live translator UI
    │       └── SettingsPanel.jsx   ← Speech settings
    └── public/
        └── avatars/
            └── rocketbox-business-male-01.vrm
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Root — server status |
| GET | `/api/health` | Health check with model info |
| GET | `/api/languages` | List of supported languages |
| POST | `/api/chat` | Send a chat message, get AI reply |
| POST | `/api/translate` | Translate text between languages |
| POST | `/api/session/new` | Create a new conversation session |
| DELETE | `/api/session/{id}` | Clear a session's history |

Interactive API docs: http://127.0.0.1:8000/docs

---

## Lip Sync Technical Details

The lip synchronization uses **word-boundary event timing** from the browser's `SpeechSynthesisUtterance.onboundary` event:

1. When speech starts, the utterance fires a `boundary` event for each word.
2. Each word is analysed with an English phoneme heuristic (or syllable-count heuristic for non-Latin scripts).
3. A sequence of **viseme shapes** is queued with their durations.
4. The Three.js animation loop reads and interpolates between viseme shapes each frame.
5. VRM expressions used: `aa`, `ih`, `ou`, `ee`, `oh` (open, mid-open, rounded, etc.).
6. The mouth **closes completely** during silence and after speech ends.

This approach gives realistic word-level mouth timing without requiring server-side TTS audio streams or external lip-sync APIs.

---

## Languages Supported

| Language | Code | Speech Recognition | TTS Voice | Translation |
|---|---|---|---|---|
| English | en | ✅ en-US | ✅ | ✅ |
| Tamil | ta | ✅ ta-IN (Chrome/Edge) | ✅ (if system voice installed) | ✅ |
| Hindi | hi | ✅ hi-IN | ✅ (if system voice installed) | ✅ |
| Telugu | te | ✅ te-IN | ✅ (if system voice installed) | ✅ |
| Malayalam | ml | ✅ ml-IN | ✅ (if system voice installed) | ✅ |
| Kannada | kn | ✅ kn-IN | ✅ (if system voice installed) | ✅ |
| Spanish | es | ✅ es-ES | ✅ | ✅ |

> **Note:** Indian language TTS voices require Windows language packs. Install via  
> **Settings → Time & Language → Language → Add a language**.  
> Speech recognition for Indian languages works best in Chrome and Edge.

---

## Limitations

1. **TTS lip sync** uses word-boundary events (not raw audio analysis). This is the best available without a server-side TTS service (e.g., Azure TTS) that provides audio + viseme timestamps.
2. **Indian language voices** require Windows language packs to be installed.
3. **Speech recognition** requires Chrome or Edge (Firefox has limited support).
4. The VRM avatar model only has certain built-in expression blendshapes (`aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `happy`).
5. All conversation history is in-memory — it resets when the backend restarts.

---

## Reinstalling Dependencies

If you need to reinstall:

```powershell
# Backend
cd backend
python -m pip install -r requirements.txt

# Frontend  
cd frontend
npm install
```
