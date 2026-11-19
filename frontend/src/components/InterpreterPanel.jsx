/**
 * InterpreterPanel — Live speech interpreter mode.
 * User speaks in source language → recognized → translated → spoken in target language.
 */

import { useState } from "react";
import useAppStore, { AVATAR_STATES, LANGUAGES } from "../store/appStore";
import { useChat } from "../hooks/useChat";
import { useSpeech } from "../hooks/useSpeech";
import { useVoiceInput } from "../hooks/useVoiceInput";

function InterpreterPanel() {
  const {
    sourceLanguage,
    targetLanguage,
    setSourceLanguage,
    setTargetLanguage,
    swapInterpreterLanguages,
    interpreterEntries,
    addInterpreterEntry,
    clearInterpreterEntries,
    setAvatarState,
  } = useAppStore();

  const { translateText } = useChat();
  const { speak, stopSpeaking } = useSpeech();
  const {
    isSupported: micSupported,
    isListening,
    transcript,
    interimTranscript,
    error: micError,
    startListening,
    stopListening,
  } = useVoiceInput();

  const [status, setStatus] = useState("idle"); // idle | listening | translating | speaking
  const [manualText, setManualText] = useState("");

  const sourceLang = LANGUAGES.find((l) => l.code === sourceLanguage);
  const targetLang = LANGUAGES.find((l) => l.code === targetLanguage);

  const handleTranslate = async (sourceText) => {
    if (!sourceText.trim()) return;

    setStatus("translating");
    setAvatarState(AVATAR_STATES.THINKING);

    const result = await translateText(sourceText, sourceLanguage, targetLanguage);

    if (!result) {
      setStatus("idle");
      setAvatarState(AVATAR_STATES.IDLE);
      return;
    }

    addInterpreterEntry({
      original: result.original,
      translation: result.translation,
      sourceLanguage,
      targetLanguage,
    });

    setStatus("speaking");
    setAvatarState(AVATAR_STATES.SPEAKING);
    await speak(result.translation, targetLanguage);
    setAvatarState(AVATAR_STATES.IDLE);
    setStatus("idle");
  };

  const handleMic = async () => {
    if (isListening) {
      stopListening();
      setStatus("idle");
      setAvatarState(AVATAR_STATES.IDLE);
      return;
    }

    stopSpeaking();
    setStatus("listening");
    setAvatarState(AVATAR_STATES.LISTENING);

    try {
      const result = await startListening(sourceLanguage);
      if (result?.trim()) {
        await handleTranslate(result);
      } else {
        setStatus("idle");
        setAvatarState(AVATAR_STATES.IDLE);
      }
    } catch (_) {
      setStatus("idle");
      setAvatarState(AVATAR_STATES.ERROR);
      setTimeout(() => setAvatarState(AVATAR_STATES.IDLE), 2000);
    }
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    const text = manualText.trim();
    setManualText("");
    await handleTranslate(text);
  };

  const statusLabel = {
    idle: "Ready — press the mic or type below",
    listening: `Listening in ${sourceLang?.name || sourceLanguage}…`,
    translating: "Translating…",
    speaking: `Speaking in ${targetLang?.name || targetLanguage}…`,
  }[status];

  return (
    <div className="interpreter-panel">
      {/* Header */}
      <div className="interpreter-header">
        <div className="interp-title">🌐 Live Interpreter</div>
        <div className="interp-subtitle">Speak and hear the translation instantly</div>
      </div>

      {/* Language pair selector */}
      <div className="lang-pair">
        <div className="lang-box">
          <label className="lang-label">Source</label>
          <select
            className="lang-select-large"
            value={sourceLanguage}
            onChange={(e) => setSourceLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn-swap"
          onClick={swapInterpreterLanguages}
          title="Swap languages"
        >
          ⇄
        </button>

        <div className="lang-box">
          <label className="lang-label">Target</label>
          <select
            className="lang-select-large"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status bar */}
      <div className={`interp-status status-${status}`}>
        {statusLabel}
        {isListening && interimTranscript && (
          <span className="interim-inline"> "{interimTranscript}"</span>
        )}
      </div>

      {/* Mic button */}
      <div className="interp-mic-row">
        {micSupported ? (
          <button
            className={`btn-mic-large ${isListening ? "listening" : ""}`}
            onClick={handleMic}
            disabled={status === "translating" || status === "speaking"}
          >
            {isListening ? "⏹ Stop" : "🎤 Speak"}
          </button>
        ) : (
          <div className="mic-unsupported">
            Voice input not supported in this browser. Use text input below.
          </div>
        )}

        {(status === "speaking") && (
          <button className="btn-stop-inline" onClick={stopSpeaking}>
            ⏹ Stop
          </button>
        )}
      </div>

      {micError && <div className="mic-error">{micError}</div>}

      {/* Manual text input fallback */}
      <form className="interp-text-form" onSubmit={handleManualSubmit}>
        <input
          type="text"
          className="chat-input"
          placeholder={`Type in ${sourceLang?.name || "source language"}…`}
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          disabled={status !== "idle"}
        />
        <button
          type="submit"
          className="btn-send"
          disabled={!manualText.trim() || status !== "idle"}
        >
          Translate
        </button>
      </form>

      {/* Translation history */}
      <div className="interp-history">
        <div className="interp-history-header">
          <span>Translation History</span>
          {interpreterEntries.length > 0 && (
            <button className="btn-clear" onClick={clearInterpreterEntries}>
              Clear
            </button>
          )}
        </div>

        {interpreterEntries.length === 0 ? (
          <div className="interp-empty">No translations yet.</div>
        ) : (
          [...interpreterEntries].reverse().map((entry) => (
            <div key={entry.id} className="interp-entry">
              <div className="interp-original">
                <span className="interp-lang-tag">
                  {LANGUAGES.find((l) => l.code === entry.sourceLanguage)?.flag}{" "}
                  {LANGUAGES.find((l) => l.code === entry.sourceLanguage)?.name}
                </span>
                <p>{entry.original}</p>
              </div>
              <div className="interp-translation">
                <span className="interp-lang-tag target">
                  {LANGUAGES.find((l) => l.code === entry.targetLanguage)?.flag}{" "}
                  {LANGUAGES.find((l) => l.code === entry.targetLanguage)?.name}
                </span>
                <p>{entry.translation}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default InterpreterPanel;
