/**
 * ChatPanel — Full chat UI with message history, voice input, and controls.
 */

import { useEffect, useRef, useState } from "react";
import useAppStore, { AVATAR_STATES, LANGUAGES } from "../store/appStore";
import { useChat } from "../hooks/useChat";
import { useSpeech } from "../hooks/useSpeech";
import { useVoiceInput } from "../hooks/useVoiceInput";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function ThinkingDots() {
  return (
    <span className="thinking-dots">
      <span>.</span><span>.</span><span>.</span>
    </span>
  );
}

function ChatPanel() {
  const {
    messages,
    loading,
    avatarState,
    language,
    setLanguage,
    setAvatarState,
  } = useAppStore();

  const [input, setInput] = useState("");
  const { sendMessage, newConversation } = useChat();
  const { speak, stopSpeaking } = useSpeech();
  const {
    isSupported: micSupported,
    isListening,
    transcript,
    interimTranscript,
    error: micError,
    startListening,
    stopListening,
    clearTranscript,
  } = useVoiceInput();

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const lastSpokenRef = useRef(null);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Fill input when voice transcript arrives
  useEffect(() => {
    if (transcript && transcript !== lastSpokenRef.current) {
      setInput(transcript);
    }
  }, [transcript]);

  const handleSend = async (textOverride) => {
    const text = (textOverride || input).trim();
    if (!text || loading) return;

    setInput("");
    clearTranscript();

    const reply = await sendMessage(text);
    if (reply) {
      setAvatarState(AVATAR_STATES.SPEAKING);
      await speak(reply);
      setAvatarState(AVATAR_STATES.IDLE);
    }
  };

  const handleMic = async () => {
    if (isListening) {
      stopListening();
      return;
    }

    stopSpeaking();
    setAvatarState(AVATAR_STATES.LISTENING);
    try {
      const result = await startListening();
      setAvatarState(AVATAR_STATES.IDLE);
      if (result?.trim()) {
        setInput(result);
        // Auto-submit on voice for voice mode convenience
        await handleSend(result);
      }
    } catch (_) {
      setAvatarState(AVATAR_STATES.ERROR);
      setTimeout(() => setAvatarState(AVATAR_STATES.IDLE), 2000);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewConversation = () => {
    stopSpeaking();
    newConversation();
  };

  const isSpeaking = avatarState === AVATAR_STATES.SPEAKING;

  return (
    <div className="chat-panel">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <div className="chat-title">AI Conversation</div>
          <div className="chat-subtitle">Powered by Groq AI</div>
        </div>
        <div className="chat-header-right">
          {/* Language selector */}
          <select
            className="lang-select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            title="Select language"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
          <button
            className="btn-icon"
            onClick={handleNewConversation}
            title="New conversation"
          >
            ✦
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            <div className="message-header">
              <span className="message-role">
                {msg.role === "user" ? "You" : "Steve"}
              </span>
              <span className="message-time">{formatTime(msg.timestamp)}</span>
            </div>
            <p className="message-text">{msg.text}</p>
          </div>
        ))}

        {loading && (
          <div className="message message-assistant">
            <div className="message-header">
              <span className="message-role">Steve</span>
            </div>
            <p className="message-text thinking">
              Steve is thinking<ThinkingDots />
            </p>
          </div>
        )}

        {micError && (
          <div className="mic-error">{micError}</div>
        )}

        {isListening && interimTranscript && (
          <div className="interim-transcript">
            <span className="interim-label">Listening:</span> {interimTranscript}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        {/* Stop speaking */}
        {isSpeaking && (
          <button
            className="btn-stop-speak"
            onClick={stopSpeaking}
            title="Stop speaking"
          >
            ⏹
          </button>
        )}

        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder={
            isListening
              ? "Listening…"
              : "Ask Steve a question (e.g. 'Steve, what can you do?')..."
          }
          value={isListening ? (interimTranscript || input) : input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading || isListening}
        />

        {/* Mic button */}
        {micSupported && (
          <button
            className={`btn-mic ${isListening ? "listening" : ""}`}
            onClick={handleMic}
            title={isListening ? "Stop listening" : "Start voice input"}
            disabled={loading && !isListening}
          >
            {isListening ? (
              <span className="mic-icon pulse">🔴</span>
            ) : (
              <span className="mic-icon">🎤</span>
            )}
          </button>
        )}

        {/* Send button */}
        <button
          className="btn-send"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading || isListening}
          title="Send message"
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;
