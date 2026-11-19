/**
 * SettingsPanel — Voice, speech, and avatar settings.
 */

import { useEffect, useState } from "react";
import useAppStore from "../store/appStore";

function SettingsPanel({ onClose }) {
  const {
    speechRate, setSpeechRate,
    speechPitch, setSpeechPitch,
    speechVolume, setSpeechVolume,
  } = useAppStore();

  const [voices, setVoices] = useState([]);

  useEffect(() => {
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, []);

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h3>Settings</h3>
        <button className="btn-icon" onClick={onClose}>✕</button>
      </div>

      <div className="settings-section">
        <label className="settings-label">
          Speech Speed: <span>{speechRate.toFixed(1)}×</span>
        </label>
        <input
          type="range"
          min="0.5" max="2.0" step="0.1"
          value={speechRate}
          onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
          className="settings-range"
        />
        <div className="range-labels"><span>0.5×</span><span>2.0×</span></div>
      </div>

      <div className="settings-section">
        <label className="settings-label">
          Pitch: <span>{speechPitch.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min="0.5" max="2.0" step="0.1"
          value={speechPitch}
          onChange={(e) => setSpeechPitch(parseFloat(e.target.value))}
          className="settings-range"
        />
        <div className="range-labels"><span>Low</span><span>High</span></div>
      </div>

      <div className="settings-section">
        <label className="settings-label">
          Volume: <span>{Math.round(speechVolume * 100)}%</span>
        </label>
        <input
          type="range"
          min="0" max="1" step="0.05"
          value={speechVolume}
          onChange={(e) => setSpeechVolume(parseFloat(e.target.value))}
          className="settings-range"
        />
        <div className="range-labels"><span>0%</span><span>100%</span></div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Available Voices ({voices.length})</label>
        <div className="voice-list">
          {voices.length === 0 && (
            <div className="voice-none">Loading voices…</div>
          )}
          {voices.slice(0, 20).map((v, i) => (
            <div key={i} className="voice-item">
              <span className="voice-name">{v.name}</span>
              <span className="voice-lang">{v.lang}</span>
            </div>
          ))}
          {voices.length > 20 && (
            <div className="voice-more">+{voices.length - 20} more voices</div>
          )}
        </div>
      </div>

      <div className="settings-note">
        Voice availability depends on your browser and operating system.
        Windows voices are managed in Settings → Time &amp; Language → Speech.
      </div>
    </div>
  );
}

export default SettingsPanel;
