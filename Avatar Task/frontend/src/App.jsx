/**
 * App.jsx — Root component for Steve AI Virtual Avatar Assistant.
 * Manages mode switching, avatar container (photoreal & 3D),
 * wake-word activation ("Steve"), backend health check, and layout.
 */

import { useEffect } from "react";
import Avatar3D from "./components/Avatar3D";
import AvatarStatus from "./components/AvatarStatus";
import ChatPanel from "./components/ChatPanel";
import InterpreterPanel from "./components/InterpreterPanel";
import SettingsPanel from "./components/SettingsPanel";
import useAppStore, { AVATAR_STATES, MODES } from "./store/appStore";
import { useWakeWord } from "./hooks/useWakeWord";
import { useChat } from "./hooks/useChat";
import { useSpeech } from "./hooks/useSpeech";
import "./App.css";

function App() {
  const {
    mode,
    setMode,
    showSettings,
    toggleSettings,
    setBackendOnline,
    backendUrl,
    setAvatarState,
  } = useAppStore();

  const { sendMessage } = useChat();
  const { speak } = useSpeech();

  // Hands-free "Steve" wake-word automatic listener
  const handleWakeWordQuestion = async (question) => {
    if (!question || !question.trim()) return;
    const reply = await sendMessage(question);
    if (reply) {
      setAvatarState(AVATAR_STATES.SPEAKING);
      await speak(reply);
      setAvatarState(AVATAR_STATES.IDLE);
    }
  };

  const { wakeWordEnabled, wakeWordTriggered, toggleWakeWord } = useWakeWord({
    onQuestionSubmit: handleWakeWordQuestion,
  });

  // Health-check the backend every 15 seconds
  useEffect(() => {
    let timer;
    const check = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/health`, {
          signal: AbortSignal.timeout(4000),
        });
        setBackendOnline(res.ok);
      } catch {
        setBackendOnline(false);
      }
    };
    check();
    timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [backendUrl, setBackendOnline]);

  return (
    <div className="app">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">◈</span>
          <div>
            <div className="header-title">STEVE</div>
            <div className="header-subtitle">AI Virtual Assistant</div>
          </div>
        </div>

        <nav className="mode-tabs">
          {[
            { id: MODES.CHAT, label: "💬 Chat" },
            { id: MODES.VOICE, label: "🎙️ Voice" },
            { id: MODES.INTERPRETER, label: "🌐 Interpreter" },
          ].map(({ id, label }) => (
            <button
              key={id}
              className={`mode-tab ${mode === id ? "active" : ""}`}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          {/* Hands-Free Wake Word Toggle ("Steve") */}
          <button
            className={`btn-wake-word ${wakeWordEnabled ? "active" : ""} ${
              wakeWordTriggered ? "triggered" : ""
            }`}
            onClick={toggleWakeWord}
            title={
              wakeWordEnabled
                ? 'Hands-free Wake Word is ON. Say "Steve..." to ask questions automatically.'
                : 'Click to enable hands-free "Steve" wake word.'
            }
          >
            <span className="wake-indicator-dot" />
            <span className="wake-label">
              {wakeWordTriggered
                ? "🎙️ Steve listening..."
                : wakeWordEnabled
                ? 'Say "Steve..."'
                : "Wake Word: Off"}
            </span>
          </button>

          <button
            className="btn-settings"
            onClick={toggleSettings}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <main className="app-main">
        {/* Avatar section (3D VRM Steve) */}
        <section className="avatar-section">
          <div className="avatar-canvas">
            <Avatar3D />
          </div>
          <AvatarStatus />
        </section>

        {/* Right panel — changes based on mode */}
        <section className="panel-section">
          {mode === MODES.INTERPRETER ? <InterpreterPanel /> : <ChatPanel />}
        </section>
      </main>

      {/* ── Settings overlay ────────────────────────────────────── */}
      {showSettings && (
        <div
          className="settings-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) toggleSettings();
          }}
        >
          <SettingsPanel onClose={toggleSettings} />
        </div>
      )}
    </div>
  );
}

export default App;
