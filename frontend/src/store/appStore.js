/**
 * Global application state using Zustand.
 * Manages mode, language, session, avatar state, and settings.
 */
import { create } from "zustand";

export const MODES = {
  CHAT: "chat",
  VOICE: "voice",
  INTERPRETER: "interpreter",
};

export const AVATAR_STATES = {
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
  ERROR: "error",
};

export const LANGUAGES = [
  { code: "en", name: "English",   bcp47: "en-US", flag: "🇬🇧" },
  { code: "ta", name: "Tamil",     bcp47: "ta-IN", flag: "🇮🇳" },
  { code: "hi", name: "Hindi",     bcp47: "hi-IN", flag: "🇮🇳" },
  { code: "te", name: "Telugu",    bcp47: "te-IN", flag: "🇮🇳" },
  { code: "ml", name: "Malayalam", bcp47: "ml-IN", flag: "🇮🇳" },
  { code: "kn", name: "Kannada",   bcp47: "kn-IN", flag: "🇮🇳" },
  { code: "es", name: "Spanish",   bcp47: "es-ES", flag: "🇪🇸" },
];

const BACKEND_URL = "http://127.0.0.1:8000";

const useAppStore = create((set, get) => ({
  // ── Mode ─────────────────────────────────────────────────────────
  mode: MODES.CHAT,
  setMode: (mode) => set({ mode }),

  // ── Language ─────────────────────────────────────────────────────
  language: "en",
  setLanguage: (code) => set({ language: code }),

  // Interpreter specific
  sourceLanguage: "ta",
  targetLanguage: "en",
  setSourceLanguage: (code) => set({ sourceLanguage: code }),
  setTargetLanguage: (code) => set({ targetLanguage: code }),
  swapInterpreterLanguages: () =>
    set((s) => ({ sourceLanguage: s.targetLanguage, targetLanguage: s.sourceLanguage })),

  // ── Session ───────────────────────────────────────────────────────
  sessionId: null,
  setSessionId: (id) => set({ sessionId: id }),
  backendUrl: BACKEND_URL,

  // ── Messages (chat mode) ──────────────────────────────────────────
  messages: [
    {
      id: "init",
      role: "assistant",
      text: "Hello! I'm Steve, your AI virtual assistant. How can I help you today?",
      timestamp: Date.now(),
    },
  ],
  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { id: crypto.randomUUID(), timestamp: Date.now(), ...msg },
      ],
    })),
  clearMessages: () =>
    set({
      messages: [
        {
          id: "init",
          role: "assistant",
          text: "Hello! I'm Steve, your AI virtual assistant. How can I help you today?",
          timestamp: Date.now(),
        },
      ],
      sessionId: null,
    }),

  // ── Interpreter history ───────────────────────────────────────────
  interpreterEntries: [],
  addInterpreterEntry: (entry) =>
    set((s) => ({
      interpreterEntries: [
        ...s.interpreterEntries,
        { id: crypto.randomUUID(), timestamp: Date.now(), ...entry },
      ],
    })),
  clearInterpreterEntries: () => set({ interpreterEntries: [] }),

  // ── Avatar state ──────────────────────────────────────────────────
  avatarState: AVATAR_STATES.IDLE,
  setAvatarState: (state) => set({ avatarState: state }),
  avatarLoaded: false,
  setAvatarLoaded: (v) => set({ avatarLoaded: v }),

  // ── Lip sync signal ───────────────────────────────────────────────
  // audioAmplitude is updated every animation frame from Web Audio API
  audioAmplitude: 0,
  setAudioAmplitude: (v) => set({ audioAmplitude: v }),

  // ── Loading ───────────────────────────────────────────────────────
  loading: false,
  setLoading: (v) => set({ loading: v }),

  // ── Settings ──────────────────────────────────────────────────────
  speechRate: 1.0,
  speechPitch: 1.0,
  speechVolume: 1.0,
  setSpeechRate: (v) => set({ speechRate: v }),
  setSpeechPitch: (v) => set({ speechPitch: v }),
  setSpeechVolume: (v) => set({ speechVolume: v }),

  showSettings: false,
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),

  // ── Backend status ────────────────────────────────────────────────
  backendOnline: false,
  setBackendOnline: (v) => set({ backendOnline: v }),
}));

export default useAppStore;
