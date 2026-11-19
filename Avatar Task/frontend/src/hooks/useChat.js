/**
 * useChat — API calls for chat and translation.
 */

import { useCallback } from "react";
import useAppStore, { AVATAR_STATES } from "../store/appStore";

export function useChat() {
  const {
    backendUrl,
    sessionId,
    setSessionId,
    language,
    addMessage,
    setLoading,
    setAvatarState,
    clearMessages,
  } = useAppStore();

  /**
   * Send a chat message and return the AI reply.
   * @param {string} text
   * @returns {Promise<string>} The assistant's reply text
   */
  const sendMessage = useCallback(
    async (text) => {
      if (!text.trim()) return null;

      addMessage({ role: "user", text });
      setLoading(true);
      setAvatarState(AVATAR_STATES.THINKING);

      try {
        const res = await fetch(`${backendUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            session_id: sessionId,
            language,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Server error ${res.status}`);
        }

        const data = await res.json();

        // Persist session ID for conversation continuity
        if (data.session_id && !sessionId) {
          setSessionId(data.session_id);
        }

        addMessage({ role: "assistant", text: data.reply });
        return data.reply;
      } catch (error) {
        const errMsg =
          "Sorry, I couldn't reach the AI server. Please check that the backend is running.";
        addMessage({ role: "assistant", text: errMsg });
        setAvatarState(AVATAR_STATES.ERROR);
        console.error("Chat error:", error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [backendUrl, sessionId, language, addMessage, setLoading, setAvatarState, setSessionId]
  );

  /**
   * Translate text using the backend translation endpoint.
   * @param {string} text
   * @param {string} sourceLang - ISO 639-1 code
   * @param {string} targetLang - ISO 639-1 code
   * @returns {Promise<{original: string, translation: string}|null>}
   */
  const translateText = useCallback(
    async (text, sourceLang, targetLang) => {
      if (!text.trim()) return null;

      try {
        const res = await fetch(`${backendUrl}/api/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            source_language: sourceLang,
            target_language: targetLang,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Translation error ${res.status}`);
        }

        const data = await res.json();
        return { original: data.original, translation: data.translation };
      } catch (error) {
        console.error("Translation error:", error);
        return null;
      }
    },
    [backendUrl]
  );

  /**
   * Start a new conversation (clears messages and backend session).
   */
  const newConversation = useCallback(async () => {
    if (sessionId) {
      try {
        await fetch(`${backendUrl}/api/session/${sessionId}`, { method: "DELETE" });
      } catch (_) {
        // ignore
      }
    }
    clearMessages();
  }, [backendUrl, sessionId, clearMessages]);

  return { sendMessage, translateText, newConversation };
}
