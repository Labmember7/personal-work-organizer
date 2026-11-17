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
  { id: "25-5", label: "25 / 5", focus: 25 * 60, rest: 5 * 60 },
  { id: "50-10", label: "50 / 10", focus: 50 * 60, rest: 10 * 60 },
  { id: "15-3", label: "15 / 3", focus: 15 * 60, rest: 3 * 60 },
];

function formatMMSS(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function PomodoroTimer({
  subTab = "pomodoro",
  onSubTabChange,
  preset = PRESETS[0],
  activePreset = preset,
  isViewingOtherPreset = false,
  isPomoActive: externalIsActive,
  phase = "focus",
  timeLeft = PRESETS[0].focus,
  isRunning = false,
  soundEnabled = true,
  cycleCount = 1,
  onSelectPreset,
  onReturnToActive,
  onStartViewed,
  onTogglePlay,
  onSkipPhase,
  onReset,
  onToggleSound,
}) {
  const totalPhaseSec = phase === "focus" ? activePreset.focus : activePreset.rest;
  const isPomoActive =
    externalIsActive ?? (isRunning || phase !== "focus" || timeLeft < totalPhaseSec);

  const displayedSeconds = isViewingOtherPreset ? preset.focus : timeLeft;
  const displayedPhase = isViewingOtherPreset ? "focus" : phase;
  const displayedRunning = !isViewingOtherPreset && isRunning;
  const timeFormatted = formatMMSS(displayedSeconds);
  const activeTimeFormatted = formatMMSS(timeLeft);

  const progressPercent = isViewingOtherPreset
    ? 0
    : Math.min(100, Math.max(0, ((totalPhaseSec - timeLeft) / totalPhaseSec) * 100));

  const handlePrimaryPlay = () => {
    if (isViewingOtherPreset && onStartViewed) {
      onStartViewed();
      return;
    }
    onTogglePlay?.();
  };

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
          onClick={() => onToggleSound?.()}
          title={soundEnabled ? "Chimes On" : "Muted"}
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
            {PRESETS.map((p) => {
              const isSelected = preset.id === p.id;
              const isLivePreset = isPomoActive && activePreset.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={
                    "trk-pomo-preset-btn" +
                    (isSelected ? " active" : "") +
                    (isLivePreset ? " is-live" : "")
                  }
                  onClick={() => onSelectPreset?.(p)}
                >
                  {isLivePreset && (
                    <span
                      className={"trk-pomo-live-dot" + (isRunning ? " running" : "")}
                      aria-hidden="true"
                    />
                  )}
                  <span>{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Cadran de timer épuré & tactile */}
          <div className={"trk-pomo-card " + displayedPhase + (displayedRunning ? " running" : "")}>
            <div className="trk-pomo-badge-row">
              <span className={"trk-pomo-phase-badge " + displayedPhase}>
                {displayedPhase === "focus" ? (
                  <>
                    <Flame size={12} className="trk-pomo-flame" />
                    <span>Focus</span>
                  </>
                ) : (
                  <>
                    <Coffee size={12} className="trk-pomo-coffee" />
                    <span>Rest</span>
                  </>
                )}
              </span>

              {isViewingOtherPreset && isPomoActive ? (
                <button
                  type="button"
                  className={"trk-pomo-active-return " + phase + (isRunning ? " running" : "")}
                  onClick={() => onReturnToActive?.()}
                  title="Return to started timer"
                >
                  <span className={"trk-pomo-live-dot" + (isRunning ? " running" : "")} />
                  <span className="trk-mono">
                    {activePreset.label} · {activeTimeFormatted}
                  </span>
                </button>
              ) : (
                <span className="trk-pomo-cycle-badge trk-mono">
                  {isRunning && <span className="trk-pomo-live-dot running" aria-hidden="true" />}
                  #{cycleCount}
                </span>
              )}
            </div>

            {/* Grand affichage numérique avec typographie tabulaire */}
            <div className="trk-pomo-digits-box">
              <span className="trk-pomo-digits trk-mono">{timeFormatted}</span>
            </div>

            {/* Jauge de progression horizontale */}
            <div className="trk-pomo-progress-track">
              <div
                className={"trk-pomo-progress-bar " + displayedPhase}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* Commandes tactiles */}
          <div className="trk-pomo-controls">
            <button
              type="button"
              className={"trk-pomo-btn play-btn " + displayedPhase + (displayedRunning ? " running" : "")}
              onClick={handlePrimaryPlay}
            >
              {displayedRunning ? <Pause size={14} /> : <Play size={14} />}
              <span>
                {displayedRunning
                  ? "Pause"
                  : displayedPhase === "focus"
                    ? "Start Focus"
                    : "Start Rest"}
              </span>
            </button>

            <button
              type="button"
              className="trk-pomo-btn action-btn"
              onClick={onSkipPhase}
              title="Skip phase"
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
