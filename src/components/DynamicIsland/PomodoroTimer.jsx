import React from "react";
import {
  Bell,
  BellOff,
  Clock,
  Coffee,
  Flame,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
} from "lucide-react";
import { playHapticTick } from "../../lib/audioFx";
import { LargeFlipClock } from "./DigitalClock.jsx";

export const PRESETS = [
  { id: "25-5", label: "25 / 5 min", focus: 25 * 60, rest: 5 * 60 },
  { id: "50-10", label: "50 / 10 min", focus: 50 * 60, rest: 10 * 60 },
  { id: "15-3", label: "15 / 3 min", focus: 15 * 60, rest: 3 * 60 },
];

export function PomodoroTimer({
  subTab = "pomodoro",
  onSubTabChange,
  preset = PRESETS[0],
  phase = "focus",
  timeLeft = PRESETS[0].focus,
  isRunning = false,
  soundEnabled = true,
  cycleCount = 1,
  onSelectPreset,
  onTogglePlay,
  onSkipPhase,
  onReset,
  onToggleSound,
}) {
  // Formatage mm:ss
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const totalPhaseSec = phase === "focus" ? preset.focus : preset.rest;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((totalPhaseSec - timeLeft) / totalPhaseSec) * 100)
  );

  return (
    <div className="trk-pomodoro-panel">
      {/* ── Sélecteur de sous-mode (Pomodoro / Flip Clock) & Volume ── */}
      <div className="trk-pomo-header">
        <div className="trk-pomo-subtabs">
          <button
            type="button"
            className={"trk-pomo-subtab" + (subTab === "pomodoro" ? " active" : "")}
            onClick={() => {
              if (soundEnabled) playHapticTick();
              onSubTabChange?.("pomodoro");
            }}
          >
            <Flame size={12} />
            <span>Focus & Rest</span>
          </button>
          <button
            type="button"
            className={"trk-pomo-subtab" + (subTab === "flipclock" ? " active" : "")}
            onClick={() => {
              if (soundEnabled) playHapticTick();
              onSubTabChange?.("flipclock");
            }}
          >
            <Clock size={12} />
            <span>Flip Clock</span>
          </button>
        </div>

        <button
          type="button"
          className={"trk-pomo-sound-btn" + (soundEnabled ? " active" : "")}
          onClick={() => {
            playHapticTick();
            onToggleSound?.();
          }}
          title={soundEnabled ? "iPhone Chimes Enabled" : "Audio Muted"}
        >
          {soundEnabled ? <Bell size={12} /> : <BellOff size={12} />}
          <span>{soundEnabled ? "Sounds On" : "Muted"}</span>
        </button>
      </div>

      {/* ── Vue 1 : Pomodoro Focus & Rest ── */}
      {subTab === "pomodoro" ? (
        <div className="trk-pomo-body">
          {/* Presets rapides (25/5, 50/10, 15/3) */}
          <div className="trk-pomo-presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={"trk-pomo-preset-btn" + (preset.id === p.id ? " active" : "")}
                onClick={() => onSelectPreset?.(p)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Cadran de timer épuré & tactile */}
          <div className={"trk-pomo-card " + phase + (isRunning ? " running" : "")}>
            <div className="trk-pomo-badge-row">
              <span className={"trk-pomo-phase-badge " + phase}>
                {phase === "focus" ? (
                  <>
                    <Flame size={12} className="trk-pomo-flame" />
                    <span>Focus Sprint</span>
                  </>
                ) : (
                  <>
                    <Coffee size={12} className="trk-pomo-coffee" />
                    <span>Rest Break</span>
                  </>
                )}
              </span>
              <span className="trk-pomo-cycle-badge trk-mono">
                {isRunning ? "LIVE · " : ""}Cycle #{cycleCount}
              </span>
            </div>

            {/* Grand affichage numérique avec typographie tabulaire */}
            <div className="trk-pomo-digits-box">
              <span className="trk-pomo-digits trk-mono">{timeFormatted}</span>
            </div>

            {/* Jauge de progression horizontale */}
            <div className="trk-pomo-progress-track">
              <div
                className={"trk-pomo-progress-bar " + phase}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Commandes tactiles */}
          <div className="trk-pomo-controls">
            <button
              type="button"
              className={"trk-pomo-btn play-btn " + phase + (isRunning ? " running" : "")}
              onClick={onTogglePlay}
            >
              {isRunning ? <Pause size={14} /> : <Play size={14} />}
              <span>
                {isRunning
                  ? "Pause Timer"
                  : phase === "focus"
                    ? "Start Focus"
                    : "Start Rest"}
              </span>
            </button>

            <button
              type="button"
              className="trk-pomo-btn action-btn"
              onClick={onSkipPhase}
              title="Skip to next phase"
            >
              <SkipForward size={14} />
              <span>Skip</span>
            </button>

            <button
              type="button"
              className="trk-pomo-btn action-btn"
              onClick={onReset}
              title="Reset timer"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          </div>
        </div>
      ) : (
        /* ── Vue 2 : Grande Horloge Flip mécanique complète ── */
        <div className="trk-pomo-flip-container">
          <LargeFlipClock />
        </div>
      )}
    </div>
  );
}
