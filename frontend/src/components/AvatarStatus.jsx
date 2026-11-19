/**
 * AvatarStatus — Displays the avatar's current state as an overlay badge.
 */

import useAppStore, { AVATAR_STATES } from "../store/appStore";

const STATE_CONFIG = {
  [AVATAR_STATES.IDLE]: {
    label: "Steve — Ready",
    color: "#22c55e",
    pulse: false,
    icon: "●",
  },
  [AVATAR_STATES.LISTENING]: {
    label: "Listening…",
    color: "#60a5fa",
    pulse: true,
    icon: "🎤",
  },
  [AVATAR_STATES.THINKING]: {
    label: "Thinking…",
    color: "#f59e0b",
    pulse: true,
    icon: "⟳",
  },
  [AVATAR_STATES.SPEAKING]: {
    label: "Speaking…",
    color: "#a78bfa",
    pulse: true,
    icon: "🔊",
  },
  [AVATAR_STATES.ERROR]: {
    label: "Error — Reconnecting",
    color: "#ef4444",
    pulse: false,
    icon: "⚠",
  },
};

function AvatarStatus() {
  const { avatarState, avatarLoaded, backendOnline } = useAppStore();
  const config = STATE_CONFIG[avatarState] || STATE_CONFIG[AVATAR_STATES.IDLE];

  if (!avatarLoaded) {
    return (
      <div className="avatar-status loading">
        <span className="status-spinner">⟳</span>
        Loading avatar…
      </div>
    );
  }

  return (
    <div className="avatar-status">
      <span
        className={`status-dot ${config.pulse ? "pulsing" : ""}`}
        style={{ background: config.color, boxShadow: `0 0 10px ${config.color}` }}
      />
      <span className="status-icon">{config.icon}</span>
      <span className="status-label">{config.label}</span>
      {!backendOnline && (
        <span className="backend-offline" title="Backend not reachable">
          · Backend offline
        </span>
      )}
    </div>
  );
}

export default AvatarStatus;
