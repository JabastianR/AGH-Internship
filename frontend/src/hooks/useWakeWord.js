/**
 * useWakeWord — Hands-free wake-word detection for "Steve" / "Hey Steve".
 *
 * How it works:
 * 1. Runs continuous speech recognition in the background.
 * 2. When the user says "Steve" or "Hey Steve", the microphone immediately
 *    activates, takes the user's spoken question, and submits it to the assistant.
 * 3. Pauses while Steve is speaking, then automatically re-arms.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import useAppStore, { AVATAR_STATES } from "../store/appStore";

export function useWakeWord({ onQuestionSubmit }) {
  const { avatarState, language } = useAppStore();

  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [wakeWordTriggered, setWakeWordTriggered] = useState(false);
  const [wakeStatus, setWakeStatus] = useState("idle"); // idle | listening | triggered

  const recognitionRef = useRef(null);
  const timeoutRef = useRef(null);
  const isSpeakingOrThinking =
    avatarState === AVATAR_STATES.SPEAKING ||
    avatarState === AVATAR_STATES.THINKING;

  const isSpeakingRef = useRef(isSpeakingOrThinking);
  isSpeakingRef.current = isSpeakingOrThinking;

  const onQuestionSubmitRef = useRef(onQuestionSubmit);
  onQuestionSubmitRef.current = onQuestionSubmit;

  // Toggle wake word mode
  const toggleWakeWord = useCallback(() => {
    setWakeWordEnabled((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!wakeWordEnabled) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        recognitionRef.current = null;
      }
      setWakeStatus("idle");
      setWakeWordTriggered(false);
      return;
    }

    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      console.warn("SpeechRecognition not available for wake word.");
      return;
    }

    let active = true;

    const startListener = () => {
      if (!active || !wakeWordEnabled || isSpeakingRef.current) return;

      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === "en" ? "en-US" : language;

        recognition.onstart = () => {
          if (active) setWakeStatus("listening");
        };

        recognition.onresult = (event) => {
          if (isSpeakingRef.current) return;

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript.trim();

            // Regex for detecting "Steve", "Hey Steve", "Hi Steve", "Ok Steve"
            const match = transcript.match(/\b(?:hey\s+|hi\s+|hello\s+|ok\s+)?steve\b(.*)/i);

            if (match) {
              setWakeWordTriggered(true);
              setWakeStatus("triggered");

              const capturedText = match[1]?.trim() || "";

              // If the user already asked a question in the same phrase:
              // e.g. "Steve what can you do"
              if (result.isFinal && capturedText.length > 2) {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                setWakeWordTriggered(false);
                setWakeStatus("listening");
                if (onQuestionSubmitRef.current) {
                  onQuestionSubmitRef.current(capturedText);
                }
              } else if (result.isFinal && capturedText.length === 0) {
                // User just said "Steve" or "Hey Steve" — wait up to 5s for follow-up
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                  setWakeWordTriggered(false);
                  setWakeStatus("listening");
                }, 5000);
              }
            } else if (wakeWordTriggered && result.isFinal && transcript) {
              // User spoke their question after the wake word was triggered
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setWakeWordTriggered(false);
              setWakeStatus("listening");
              if (onQuestionSubmitRef.current) {
                onQuestionSubmitRef.current(transcript);
              }
            }
          }
        };

        recognition.onerror = (e) => {
          if (e.error !== "no-speech" && e.error !== "aborted") {
            console.warn("Wake word listener error:", e.error);
          }
        };

        recognition.onend = () => {
          if (active && wakeWordEnabled && !isSpeakingRef.current) {
            // Auto restart to keep wake-word active
            setTimeout(startListener, 300);
          }
        };

        recognition.start();
      } catch (err) {
        console.warn("Could not start wake word listener:", err);
      }
    };

    if (!isSpeakingOrThinking) {
      startListener();
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }
    }

    return () => {
      active = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
        recognitionRef.current = null;
      }
    };
  }, [wakeWordEnabled, isSpeakingOrThinking, language]);

  return {
    wakeWordEnabled,
    wakeWordTriggered,
    wakeStatus,
    toggleWakeWord,
  };
}
