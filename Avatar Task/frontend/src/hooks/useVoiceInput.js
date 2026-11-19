/**
 * useVoiceInput — Speech recognition hook using Web Speech API.
 * Handles microphone permissions, language-specific recognition,
 * interim results display, and error reporting.
 */

import { useCallback, useRef, useState } from "react";
import useAppStore, { LANGUAGES } from "../store/appStore";

export function useVoiceInput() {
  const { language, sourceLanguage, mode } = useAppStore();

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const manualStopRef = useRef(false);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  /**
   * Start listening.
   * @param {string} [langOverride] - BCP-47 language code override
   * @returns {Promise<string>} Resolves with the final transcript
   */
  const startListening = useCallback(
    (langOverride = null) => {
      return new Promise((resolve, reject) => {
        if (!isSupported) {
          reject(new Error("Speech recognition is not supported in this browser."));
          return;
        }

        // Stop any existing session
        if (recognitionRef.current) {
          manualStopRef.current = true;
          recognitionRef.current.abort();
          recognitionRef.current = null;
        }

        const SpeechRecognition =
          window.SpeechRecognition || window.webkitSpeechRecognition;

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        manualStopRef.current = false;

        // Pick the right language code
        const activeLang = langOverride || (mode === "interpreter" ? sourceLanguage : language);
        const langConfig = LANGUAGES.find((l) => l.code === activeLang);
        recognition.lang = langConfig?.bcp47 || "en-US";

        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        setIsListening(true);
        setTranscript("");
        setInterimTranscript("");
        setError(null);

        let finalResult = "";

        recognition.onresult = (event) => {
          let interim = "";
          let final = "";

          for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            if (result.isFinal) {
              final += result[0].transcript;
            } else {
              interim += result[0].transcript;
            }
          }

          if (final) {
            finalResult = final;
            setTranscript(final);
            setInterimTranscript("");
          } else {
            setInterimTranscript(interim);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
          setInterimTranscript("");
          if (!manualStopRef.current) {
            resolve(finalResult);
          }
        };

        recognition.onerror = (event) => {
          setIsListening(false);
          setInterimTranscript("");
          let message = "Speech recognition error.";
          if (event.error === "not-allowed") {
            message = "Microphone permission denied. Please allow microphone access.";
          } else if (event.error === "no-speech") {
            message = "No speech detected. Please try again.";
          } else if (event.error === "network") {
            message = "Network error during recognition. Check your connection.";
          } else {
            message = `Recognition error: ${event.error}`;
          }
          setError(message);
          if (!manualStopRef.current) {
            reject(new Error(message));
          }
        };

        try {
          recognition.start();
        } catch (e) {
          setIsListening(false);
          reject(e);
        }
      });
    },
    [isSupported, language, sourceLanguage, mode]
  );

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      manualStopRef.current = true;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
