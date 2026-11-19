/**
 * useSpeech — Text-to-speech with realistic audio-synchronized lip sync.
 *
 * Architecture:
 * - Shared module-level singleton state so all components (ChatPanel,
 *   Avatar3D, InterpreterPanel) stay 100% in sync without prop drilling.
 * - Word boundary phoneme-to-viseme mapping for precise phonetic mouth shapes.
 * - Syllabic articulation generator fallback for voices/browsers where boundary
 *   events have gaps or low frequency.
 * - Smooth lerp transitions and immediate mouth closure upon speech termination.
 */

import { useCallback } from "react";
import useAppStore, { AVATAR_STATES, LANGUAGES } from "../store/appStore";

// ---------------------------------------------------------------------------
// Phoneme / Viseme Mapping Utilities
// ---------------------------------------------------------------------------

export function visemeToExpressionWeights(shape) {
  const map = {
    rest: { aa: 0,    ih: 0,    ou: 0,    ee: 0,    oh: 0    },
    aa:   { aa: 0.85, ih: 0,    ou: 0,    ee: 0,    oh: 0.15 },
    ih:   { aa: 0.25, ih: 0.75, ou: 0,    ee: 0.3,  oh: 0    },
    ou:   { aa: 0.1,  ih: 0,    ou: 0.85, ee: 0,    oh: 0.35 },
    ee:   { aa: 0,    ih: 0.35, ou: 0,    ee: 0.85, oh: 0    },
    oh:   { aa: 0.35, ih: 0,    ou: 0.3,  ee: 0,    oh: 0.7  },
    pp:   { aa: 0,    ih: 0,    ou: 0,    ee: 0,    oh: 0    }, // bilabial closure
    ff:   { aa: 0.1,  ih: 0.25, ou: 0,    ee: 0.1,  oh: 0    }, // labiodental
    th:   { aa: 0.2,  ih: 0.2,  ou: 0,    ee: 0.15, oh: 0    },
    ss:   { aa: 0,    ih: 0.3,  ou: 0,    ee: 0.45, oh: 0    },
    nn:   { aa: 0.15, ih: 0.1,  ou: 0,    ee: 0.1,  oh: 0    },
  };
  return map[shape] || map.rest;
}

function wordToVisemes(word, langCode = "en") {
  const clean = word.toLowerCase().trim();
  if (!clean) return [{ shape: "rest", duration: 0.08 }];

  // For Indic and other non-Latin scripts: syllable cadence
  if (langCode !== "en" && langCode !== "es") {
    const syllableCount = Math.max(1, Math.min(6, Math.round(clean.length / 2.2)));
    const seq = [];
    const shapes = ["aa", "oh", "ee", "ih", "ou"];
    for (let i = 0; i < syllableCount; i++) {
      seq.push({ shape: shapes[i % shapes.length], duration: 0.11 });
      seq.push({ shape: "rest", duration: 0.05 });
    }
    return seq;
  }

  // English & Spanish phoneme parsing
  const visemes = [];
  let i = 0;
  while (i < clean.length) {
    const c = clean[i];
    const next = clean[i + 1] || "";

    if ("aeiou".includes(c)) {
      if (c === "a") {
        if (next === "i" || next === "y") {
          visemes.push({ shape: "ee", duration: 0.1 });
          i += 2;
        } else if (next === "u" || next === "w") {
          visemes.push({ shape: "ou", duration: 0.11 });
          i += 2;
        } else {
          visemes.push({ shape: "aa", duration: 0.12 });
          i++;
        }
      } else if (c === "e") {
        visemes.push({ shape: "ee", duration: 0.09 });
        i++;
      } else if (c === "i") {
        visemes.push({ shape: "ih", duration: 0.09 });
        i++;
      } else if (c === "o") {
        if (next === "o") {
          visemes.push({ shape: "ou", duration: 0.12 });
          i += 2;
        } else {
          visemes.push({ shape: "oh", duration: 0.11 });
          i++;
        }
      } else if (c === "u") {
        visemes.push({ shape: "ou", duration: 0.1 });
        i++;
      }
    } else if ("pbm".includes(c)) {
      visemes.push({ shape: "pp", duration: 0.06 });
      i++;
    } else if ("fv".includes(c)) {
      visemes.push({ shape: "ff", duration: 0.07 });
      i++;
    } else if (c === "t" && next === "h") {
      visemes.push({ shape: "th", duration: 0.08 });
      i += 2;
    } else if (c === "s" || c === "z") {
      visemes.push({ shape: "ss", duration: 0.07 });
      i++;
    } else {
      visemes.push({ shape: "nn", duration: 0.06 });
      i++;
    }
  }

  if (visemes.length === 0) return [{ shape: "aa", duration: 0.1 }];
  return visemes;
}

// ---------------------------------------------------------------------------
// Shared Module Singleton State (Cross-Component Synchronisation)
// ---------------------------------------------------------------------------

const sharedSpeechState = {
  speaking: false,
  visemeQueue: [],
  visemeTimer: 0,
  currentWeights: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 },
  targetWeights: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 },
  speechElapsed: 0,
  activeUtterance: null,
};

// ---------------------------------------------------------------------------
// useSpeech Hook
// ---------------------------------------------------------------------------

export function useSpeech() {
  const {
    speechRate,
    speechPitch,
    speechVolume,
    language,
    setAvatarState,
    setAudioAmplitude,
  } = useAppStore();

  /**
   * Called on every Three.js render frame by Avatar3D.
   * Reads the shared singleton state and updates current mouth weights.
   */
  const getVisemeWeights = useCallback(
    (delta) => {
      const st = sharedSpeechState;

      if (!st.speaking) {
        // Smoothly return mouth to closed/rest position
        let maxWeight = 0;
        for (const k of Object.keys(st.currentWeights)) {
          st.currentWeights[k] = Math.max(0, st.currentWeights[k] - delta * 12);
          if (st.currentWeights[k] > maxWeight) maxWeight = st.currentWeights[k];
        }
        setAudioAmplitude(0);
        return { ...st.currentWeights };
      }

      st.speechElapsed += delta;

      // Advance viseme queue if available
      st.visemeTimer -= delta;
      while (st.visemeTimer <= 0 && st.visemeQueue.length > 0) {
        const next = st.visemeQueue.shift();
        st.targetWeights = next.weights;
        st.visemeTimer += next.duration;
      }

      // Fallback: If queue is empty while speaking (e.g. between words or voice lacks boundary events),
      // articulate naturally based on human speech cadence (~4Hz)
      if (st.visemeQueue.length === 0 && st.visemeTimer <= 0) {
        const t = st.speechElapsed;
        const syllableCycle = Math.sin(t * 12) * 0.5 + 0.5;
        const openAmount = Math.max(0, syllableCycle * 0.65);
        const vowelSwitch = Math.sin(t * 4);

        if (vowelSwitch > 0.3) {
          st.targetWeights = { aa: openAmount, ih: 0, ou: 0, ee: 0, oh: openAmount * 0.2 };
        } else if (vowelSwitch < -0.3) {
          st.targetWeights = { aa: 0.1, ih: openAmount * 0.5, ou: openAmount * 0.4, ee: 0, oh: openAmount * 0.5 };
        } else {
          st.targetWeights = { aa: openAmount * 0.4, ih: 0, ou: 0, ee: openAmount * 0.4, oh: 0 };
        }
        st.visemeTimer = 0.08;
      }

      // Smooth lerp toward target weights
      const lerpSpeed = Math.min(1, 16 * delta);
      for (const k of Object.keys(st.currentWeights)) {
        const target = st.targetWeights[k] || 0;
        st.currentWeights[k] += (target - st.currentWeights[k]) * lerpSpeed;
      }

      // Compute and publish normalized audio amplitude for UI indicators
      const amp = Math.min(
        1,
        (st.currentWeights.aa * 1.0 +
          st.currentWeights.oh * 0.8 +
          st.currentWeights.ou * 0.7 +
          st.currentWeights.ee * 0.5) /
          1.2
      );
      setAudioAmplitude(amp);

      return { ...st.currentWeights };
    },
    [setAudioAmplitude]
  );

  /**
   * Stop current speech immediately.
   */
  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    const st = sharedSpeechState;
    st.speaking = false;
    st.visemeQueue = [];
    st.visemeTimer = 0;
    st.targetWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    setAvatarState(AVATAR_STATES.IDLE);
    setAudioAmplitude(0);
  }, [setAvatarState, setAudioAmplitude]);

  /**
   * Speak text with language-appropriate voice and word-timed visemes.
   */
  const speak = useCallback(
    (text, langOverride = null) => {
      return new Promise((resolve) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) {
          console.warn("SpeechSynthesis not supported.");
          resolve();
          return;
        }

        // Cancel previous speech
        window.speechSynthesis.cancel();
        const st = sharedSpeechState;
        st.speaking = false;
        st.visemeQueue = [];
        st.visemeTimer = 0;
        st.speechElapsed = 0;
        st.targetWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

        const langCode = langOverride || language;
        const langConfig = LANGUAGES.find((l) => l.code === langCode);
        const bcp47 = langConfig?.bcp47 || "en-US";

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = speechPitch;
        utterance.volume = speechVolume;
        utterance.lang = bcp47;
        st.activeUtterance = utterance;

        // Select best matching voice
        const voices = window.speechSynthesis.getVoices();
        const exactMatch = voices.find((v) => v.lang === bcp47);
        const prefixMatch = voices.find((v) => v.lang.startsWith(bcp47.split("-")[0]));
        if (exactMatch) utterance.voice = exactMatch;
        else if (prefixMatch) utterance.voice = prefixMatch;

        // Start event
        utterance.onstart = () => {
          st.speaking = true;
          st.speechElapsed = 0;
          st.visemeQueue = [];
          setAvatarState(AVATAR_STATES.SPEAKING);
        };

        // Word boundary events: Inject phoneme shapes
        utterance.onboundary = (event) => {
          if (event.name !== "word") return;
          const word = text.slice(event.charIndex, event.charIndex + (event.charLength || 6));
          const visemes = wordToVisemes(word, langCode);
          for (const v of visemes) {
            st.visemeQueue.push({
              weights: visemeToExpressionWeights(v.shape),
              duration: v.duration / speechRate,
            });
          }
        };

        // End event
        utterance.onend = () => {
          st.speaking = false;
          st.visemeQueue = [];
          st.visemeTimer = 0;
          st.targetWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
          setAvatarState(AVATAR_STATES.IDLE);
          setAudioAmplitude(0);
          resolve();
        };

        utterance.onerror = (e) => {
          console.error("SpeechSynthesis error:", e.error);
          st.speaking = false;
          st.visemeQueue = [];
          st.visemeTimer = 0;
          st.targetWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
          setAvatarState(AVATAR_STATES.IDLE);
          setAudioAmplitude(0);
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      });
    },
    [language, speechRate, speechPitch, speechVolume, setAvatarState, setAudioAmplitude]
  );

  return { speak, stopSpeaking, getVisemeWeights, sharedSpeechState };
}
