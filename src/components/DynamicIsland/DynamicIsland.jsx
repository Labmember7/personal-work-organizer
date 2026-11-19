import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Bug,
  Check,
  ChevronUp,
  Clock,
  Compass,
  Dna,
  ExternalLink,
  Flame,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { formatDuration } from "../../utils";
import { projectColor } from "../../lib/colors";
import { clearLog, installHostConsoleCapture, subscribeLog } from "../../lib/debugLog";
import { clearPerfMetrics, getPerfState, subscribePerf } from "../../lib/performanceMonitor";
import { playAppleChime, playHapticTick } from "../../lib/audioFx";
import { getOrCreatePetDna, regeneratePetDna } from "../../lib/petGenerator";
import { DigitalClock } from "./DigitalClock.jsx";
import { PixelHelper } from "./PixelHelper.jsx";
import { PomodoroTimer } from "./PomodoroTimer.jsx";
import { usePomodoroSession } from "../../hooks/usePomodoroSession";

function formatElapsedExact(startedAt, now) {
  if (!startedAt) return "00:00";
  const totalSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function onButtonKey(fn) {
  return (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn(e);
    }
  };
}

export const DynamicIsland = React.memo(function DynamicIsland({
  focusSession,
  onEditTask,
  pomodoroSession: externalPomo,
  petState: externalPet,
  desktopPetEnabled = true,
  onToggleDesktopPet,
}) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("timer"); // "timer" | "pet" | "focus" | "debug" | "perf"
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef(null);
  const moodTimerRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());

  // ── Compagnon Unique Généré & Persistant ──
  const [localPetDna, setLocalPetDna] = useState(() => getOrCreatePetDna());
  const [localPetMood, setLocalPetMood] = useState("normal");
  const [localPetEnergy, setLocalPetEnergy] = useState(96);
  const [petBond, setPetBond] = useState(4);

  const petDna = externalPet?.petDna || localPetDna;
  const setPetDna = externalPet?.setPetDna || setLocalPetDna;
  const petMood = externalPet?.petMood || localPetMood;
  const setPetMood = externalPet?.setPetMood || setLocalPetMood;
  const petEnergy = externalPet?.petEnergy ?? localPetEnergy;
  const setPetEnergy = externalPet?.setPetEnergy || setLocalPetEnergy;

  // ── Chronomètre Pomodoro persistant en arrière-plan ──
  const internalPomo = usePomodoroSession({
    onMoodChange: (mood) => {
      setPetMood(mood === "normal" && focusSession?.focusTask ? "focused" : mood);
    },
  });

  const pomo = externalPomo || internalPomo;
  const timerSubTab = pomo.timerSubTab;
  const setTimerSubTab = pomo.setTimerSubTab;
  const pomoPreset = pomo.preset;
  const pomoPhase = pomo.phase;
  const pomoTimeLeft = pomo.timeLeft;
  const pomoRunning = pomo.isRunning;
  const pomoSound = pomo.soundEnabled;
  const pomoCycle = pomo.cycleCount;
  const pomoFormatted = pomo.timeFormatted;
  const isPomoActive = pomo.isPomoActive;

  const handleSelectPomoPreset = pomo.selectPreset;
  const handleTogglePomoPlay = pomo.togglePlay;
  const handleSkipPomoPhase = pomo.skipPhase;
  const handleResetPomo = pomo.reset;
  const handleTogglePomoSound = pomo.toggleSound;

  // Revenir automatiquement au timer démarré lors de la réouverture ou du changement d'onglet
  const isPomoActiveRef = useRef(isPomoActive);
  isPomoActiveRef.current = isPomoActive;
  const returnToActiveRef = useRef(pomo.returnToActivePreset);
  returnToActiveRef.current = pomo.returnToActivePreset;

  useEffect(() => {
    if (open && mode === "timer" && isPomoActiveRef.current) {
      returnToActiveRef.current?.();
    }
  }, [open, mode]);

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHovered(true);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      setHovered(false);
    }, 140);
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (moodTimerRef.current) clearTimeout(moodTimerRef.current);
    };
  }, []);

  // Debug state
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("");
  const [pulse, setPulse] = useState(0);
  const bodyRef = useRef(null);
  const islandRef = useRef(null);
  const lastLen = useRef(0);

  // Latency & INP Perf state (Dev Mode Only — abonné uniquement quand ouvert)
  const isDev = Boolean(import.meta.env?.DEV);
  const [perfState, setPerfState] = useState(() => (isDev ? getPerfState() : null));

  useEffect(() => {
    if (!isDev || !open) return;
    return subscribePerf(setPerfState);
  }, [isDev, open]);

  const {
    focusTask,
    focusStartedAt,
    advanceFocusTask,
    releaseFocus,
  } = focusSession || {};

  const isCooking = !!(focusTask && focusStartedAt);

  useEffect(() => {
    installHostConsoleCapture();
    return subscribeLog(setEntries);
  }, []);

  useEffect(() => {
    if (entries.length > lastLen.current && !open) {
      setPulse(1);
      const timer = setTimeout(() => setPulse(0), 450);
      lastLen.current = entries.length;
      return () => clearTimeout(timer);
    }
    lastLen.current = entries.length;
  }, [entries, open]);

  useEffect(() => {
    if (open && mode === "debug" && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries, open, mode]);

  useEffect(() => {
    if (!isCooking) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isCooking]);

  useEffect(() => {
    if (isCooking || (pomoRunning && pomoPhase === "focus")) {
      setPetMood("focused");
    } else if (pomoRunning && pomoPhase === "rest") {
      setPetMood("happy");
    } else {
      setPetMood("normal");
    }
  }, [isCooking, pomoRunning, pomoPhase, setPetMood]);

  useEffect(() => {
    if (!open && !hovered) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setHovered(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, hovered]);

  useOutsideClick(
    islandRef,
    () => {
      setOpen(false);
      setHovered(false);
    },
    open || hovered
  );

  const needle = filter.trim().toLowerCase();
  const shownLogs = needle
    ? entries.filter(
        (e) => e.source.toLowerCase().includes(needle) || e.text.toLowerCase().includes(needle)
      )
    : entries;
  const debugLevel = entries.some((e) => e.level === "error")
    ? "error"
    : entries.some((e) => e.level === "warn")
      ? "warn"
      : "ok";

  const elapsedTimer = formatElapsedExact(focusStartedAt, now);

  const defaultMood = isCooking
    ? "focused"
    : pomoRunning
      ? pomoPhase === "rest"
        ? "happy"
        : "focused"
      : "normal";

  const handlePetAction = (action) => {
    if (moodTimerRef.current) {
      clearTimeout(moodTimerRef.current);
      moodTimerRef.current = null;
    }
    if (action === "pet") {
      playHapticTick();
      setPetMood("love");
      setPetBond((b) => b + 1);
      moodTimerRef.current = setTimeout(() => setPetMood(defaultMood), 1800);
    } else if (action === "feed") {
      playHapticTick();
      setPetMood("eating");
      setPetEnergy(100);
      moodTimerRef.current = setTimeout(() => {
        setPetMood("happy");
        moodTimerRef.current = setTimeout(() => setPetMood(defaultMood), 1400);
      }, 1400);
    } else if (action === "visor") {
      playHapticTick();
      setPetMood((m) => (m === "visor" ? defaultMood : "visor"));
    } else if (action === "radar") {
      playHapticTick();
      setPetMood((m) => (m === "radar" ? defaultMood : "radar"));
    } else if (action === "sleep") {
      playHapticTick();
      setPetMood((m) => (m === "sleepy" ? defaultMood : "sleepy"));
    } else if (action === "reroll") {
      const newDna = regeneratePetDna();
      setPetDna(newDna);
      playAppleChime();
      setPetMood("happy");
      moodTimerRef.current = setTimeout(() => setPetMood(defaultMood), 2000);
    }
  };

  const hasLiveRight = isCooking || isPomoActive;

  const openFlipClock = () => {
    setMode("timer");
    setTimerSubTab("flipclock");
    setOpen(true);
  };

  const openPomodoro = () => {
    setMode("timer");
    setTimerSubTab("pomodoro");
    setOpen(true);
  };

  const openFocus = () => {
    setMode("focus");
    setOpen(true);
  };

  const openDebug = () => {
    setMode("debug");
    setOpen(true);
  };

  return (
    <div
      ref={islandRef}
      className={
        "trk-dynamic-island" +
        (open ? " open" : "") +
        (hovered && !open ? " hovered" : "") +
        (hasLiveRight ? " is-cooking" : "") +
        (isCooking && isPomoActive ? " is-dual-live" : "") +
        ` mode-${mode} subtab-${timerSubTab}`
      }
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className={"trk-island-container" + (pulse ? " pulse" : "")}>
        {/* ── ÉTAT COMPACT (!open) ── */}
        {!open && (
          <div className="trk-island-compact-view">
            <div className="trk-island-compact-triad">
              <div
                className="trk-island-triad-left"
                onClick={openFlipClock}
                onKeyDown={onButtonKey(openFlipClock)}
                role="button"
                tabIndex={0}
                title="Flip Clock"
              >
                <DigitalClock className="trk-island-clock-mini" />
              </div>

              <div className="trk-island-center-bot">
                <PixelHelper
                  size={32}
                  bubbleOut
                  mood={petMood}
                  dna={petDna}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode("pet");
                    setOpen(true);
                  }}
                />
              </div>

              <div className="trk-island-triad-right">
                {!isPomoActive && !isCooking && (
                  <button
                    type="button"
                    className={
                      "trk-island-compact-action" +
                      (!hovered ? " collapsed" : "")
                    }
                    onClick={openPomodoro}
                    title="Timer"
                    tabIndex={hovered ? 0 : -1}
                  >
                    <Clock size={11} />
                    <span>Timer</span>
                  </button>
                )}

                {isPomoActive && (
                  <div
                    className={
                      "trk-island-pomo-pill " +
                      pomoPhase +
                      (pomoRunning ? " running" : " paused")
                    }
                    onClick={openPomodoro}
                    onKeyDown={onButtonKey(openPomodoro)}
                    role="button"
                    tabIndex={0}
                    title={`${pomoPhase === "focus" ? "Focus" : "Rest"} · ${pomoFormatted}`}
                  >
                    <button
                      type="button"
                      className="trk-island-pomo-mini-toggle"
                      onClick={handleTogglePomoPlay}
                      title={pomoRunning ? "Pause" : "Resume"}
                      aria-label={pomoRunning ? "Pause timer" : "Resume timer"}
                    >
                      {pomoRunning ? <Pause size={9} /> : <Play size={9} />}
                    </button>
                    <span className="trk-island-compact-timer trk-mono">{pomoFormatted}</span>
                  </div>
                )}

                {isCooking && (
                  <div
                    className="trk-island-focus-pill"
                    onClick={openFocus}
                    onKeyDown={onButtonKey(openFocus)}
                    role="button"
                    tabIndex={0}
                    title={`${focusTask.titre} · ${elapsedTimer}`}
                  >
                    <span className="trk-island-flame-wrap">
                      <Flame size={11} className="trk-island-flame-icon" />
                    </span>
                    <span className="trk-island-compact-title">{focusTask.titre}</span>
                    <span className="trk-island-compact-timer trk-mono">{elapsedTimer}</span>
                  </div>
                )}

                <div
                  className={
                    "trk-island-compact-debug" +
                    (hasLiveRight && !hovered ? " collapsed" : "")
                  }
                  onClick={openDebug}
                  onKeyDown={onButtonKey(openDebug)}
                  role="button"
                  tabIndex={hasLiveRight && !hovered ? -1 : 0}
                  title="Debug"
                >
                  <span className={"trk-island-mini-dot " + debugLevel} />
                  <Bug size={11} className="trk-bug-mini" />
                  {entries.length > 0 && (
                    <span className="trk-island-mini-count">{entries.length}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── ÉTAT OUVERT (open === true) ── */}
        {open && (
          <div className="trk-island-expanded-view">
            <div className="trk-island-nav">
              <div
                className="trk-island-nav-clock"
                onClick={() => {
                  setMode("timer");
                  setTimerSubTab("flipclock");
                }}
                onKeyDown={onButtonKey(() => {
                  setMode("timer");
                  setTimerSubTab("flipclock");
                })}
                role="button"
                tabIndex={0}
                title="Flip Clock"
              >
                <DigitalClock className="trk-island-clock-mini" />
              </div>

              <div className="trk-island-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "timer"}
                  className={"trk-island-tab timer-tab" + (mode === "timer" ? " active" : "")}
                  onClick={() => setMode("timer")}
                >
                  <Clock size={12} />
                  <span>Timer</span>
                  {isPomoActive && (
                    <span className={"trk-island-badge pomo-badge " + pomoPhase}>
                      {pomoFormatted}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "pet"}
                  className={"trk-island-tab pet-tab" + (mode === "pet" ? " active" : "")}
                  onClick={() => setMode("pet")}
                >
                  <Sparkles size={12} className="trk-island-sparkle-icon" />
                  <span>{petDna.name}</span>
                  <span className="trk-island-badge">{petEnergy}%</span>
                </button>

                {isCooking && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "focus"}
                    className={"trk-island-tab focus-tab" + (mode === "focus" ? " active" : "")}
                    onClick={() => setMode("focus")}
                  >
                    <Flame size={12} className="trk-island-flame-icon" />
                    <span>Focus</span>
                    <span className="trk-island-badge focus-badge">{elapsedTimer}</span>
                  </button>
                )}

                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "debug"}
                  className={"trk-island-tab debug-tab" + (mode === "debug" ? " active" : "")}
                  onClick={() => setMode("debug")}
                >
                  <span className={"trk-island-mini-dot " + debugLevel} />
                  <Bug size={12} />
                  <span>Debug</span>
                  {entries.length > 0 && <span className="trk-island-badge">{entries.length}</span>}
                </button>

                {isDev && perfState && (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === "perf"}
                    className={"trk-island-tab perf-tab" + (mode === "perf" ? " active" : "")}
                    onClick={() => setMode("perf")}
                  >
                    <span
                      className={
                        "trk-island-mini-dot " +
                        (perfState.rating === "fast"
                          ? "ok"
                          : perfState.rating === "good"
                            ? "warn"
                            : "error")
                      }
                    />
                    <Activity size={12} />
                    <span>Perf</span>
                    <span className="trk-island-badge">
                      {perfState.lastLatency !== null
                        ? `${Math.round(perfState.lastLatency)}ms`
                        : `${perfState.fps}fps`}
                    </span>
                  </button>
                )}
              </div>

              <button
                type="button"
                className="trk-island-close-btn"
                onClick={() => {
                  setOpen(false);
                  setHovered(false);
                }}
                title="Collapse (Esc)"
                aria-label="Collapse Island"
              >
                <ChevronUp size={14} />
              </button>
            </div>

            <div className="trk-island-sheet">
              {/* ── 1. TIMER ── */}
              {mode === "timer" && (
                <PomodoroTimer
                  subTab={timerSubTab}
                  onSubTabChange={setTimerSubTab}
                  preset={pomoPreset}
                  activePreset={pomo.activePreset}
                  isViewingOtherPreset={pomo.isViewingOtherPreset}
                  isPomoActive={isPomoActive}
                  phase={pomoPhase}
                  timeLeft={pomoTimeLeft}
                  isRunning={pomoRunning}
                  soundEnabled={pomoSound}
                  cycleCount={pomoCycle}
                  onSelectPreset={handleSelectPomoPreset}
                  onReturnToActive={pomo.returnToActivePreset}
                  onStartViewed={pomo.startViewedPreset}
                  onTogglePlay={() => handleTogglePomoPlay()}
                  onSkipPhase={handleSkipPomoPhase}
                  onReset={handleResetPomo}
                  onToggleSound={handleTogglePomoSound}
                />
              )}

              {/* ── 2. COMPANION DECK (ÉPURÉ) ── */}
              {mode === "pet" && (
                <div className="trk-island-pet-deck">
                  <div className="trk-island-pet-stage-box">
                    <div className="trk-island-pet-hero-avatar">
                      <PixelHelper
                        size={60}
                        mood={petMood}
                        dna={petDna}
                        onClick={() => handlePetAction("pet")}
                      />
                    </div>

                    <div className="trk-island-pet-hero-info">
                      <div className="trk-island-pet-hero-title">
                        <h3>{petDna.name}</h3>
                        <span className="trk-island-pulse-dot" title="Online" />
                        <button
                          type="button"
                          className="trk-island-pet-dna-btn"
                          onClick={() => handlePetAction("reroll")}
                          title="Synthesize new unique companion DNA & traits"
                        >
                          <Dna size={12} />
                          <span>DNA</span>
                        </button>
                      </div>

                      <p className="trk-island-pet-subtitle">{petDna.archetype}</p>

                      <div className="trk-island-pet-telemetry">
                        <span className="trk-telemetry-chip">
                          <span
                            className="trk-telemetry-swatch"
                            style={{ background: petDna.palette?.neon || "#00F5D4" }}
                          />
                          <span>Palette · {petDna.palette?.name || "Cyber"}</span>
                        </span>

                        <span className="trk-telemetry-chip trk-mono">
                          <span>LVL {petBond}</span>
                          <span className="trk-telemetry-sep">·</span>
                          <span>{petEnergy}%</span>
                          <span className="trk-telemetry-bar">
                            <span className="trk-telemetry-fill" style={{ width: `${petEnergy}%` }} />
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="trk-pet-command-grid">
                    <button
                      type="button"
                      className={"trk-pet-command-btn" + (petMood === "love" ? " active" : "")}
                      onClick={() => handlePetAction("pet")}
                    >
                      <span className="trk-command-icon-box">
                        <Sparkles size={14} />
                      </span>
                      <span className="trk-command-title">Love</span>
                    </button>

                    <button
                      type="button"
                      className={"trk-pet-command-btn" + (petMood === "eating" ? " active" : "")}
                      onClick={() => handlePetAction("feed")}
                    >
                      <span className="trk-command-icon-box zap">
                        <Zap size={14} />
                      </span>
                      <span className="trk-command-title">Feed</span>
                    </button>

                    <button
                      type="button"
                      className={"trk-pet-command-btn" + (petMood === "visor" ? " active" : "")}
                      onClick={() => handlePetAction("visor")}
                    >
                      <span className="trk-command-icon-box visor">
                        <Shield size={14} />
                      </span>
                      <span className="trk-command-title">Visor</span>
                    </button>

                    <button
                      type="button"
                      className={"trk-pet-command-btn" + (petMood === "radar" ? " active" : "")}
                      onClick={() => handlePetAction("radar")}
                    >
                      <span className="trk-command-icon-box radar">
                        <Compass size={14} />
                      </span>
                      <span className="trk-command-title">Radar</span>
                    </button>

                    <button
                      type="button"
                      className={"trk-pet-command-btn" + (petMood === "sleepy" ? " active" : "")}
                      onClick={() => handlePetAction("sleep")}
                    >
                      <span className="trk-command-icon-box moon">
                        <Moon size={14} />
                      </span>
                      <span className="trk-command-title">Sleep</span>
                    </button>
                  </div>

                  <div className="trk-island-pet-option-row">
                    <div className="trk-pet-option-title">
                      <Sparkles size={13} style={{ color: "#38BDF8" }} />
                      <span>Floating Pet on Minimize</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={desktopPetEnabled}
                      className={"trk-pet-toggle-switch" + (desktopPetEnabled ? " active" : "")}
                      onClick={onToggleDesktopPet}
                      title={desktopPetEnabled ? "Disable floating pet" : "Enable floating pet"}
                    >
                      <span className="trk-pet-toggle-handle" />
                    </button>
                  </div>
                </div>
              )}

              {/* ── 3. FOCUS ── */}
              {mode === "focus" && isCooking && (
                <div className="trk-island-focus-panel">
                  <div className="trk-island-focus-card">
                    <div className="trk-island-focus-top">
                      <div className="trk-island-focus-tags">
                        <span
                          className="trk-island-project-tag"
                          style={{ "--tag-color": projectColor(focusTask.projet) }}
                        >
                          <span
                            className="trk-island-dot-bullet"
                            style={{ background: projectColor(focusTask.projet) }}
                          />
                          {focusTask.projet}
                        </span>
                        <span className="trk-island-prio-tag">
                          {t(`prio_${focusTask.priorite}`)}
                        </span>
                      </div>

                      <div className="trk-island-focus-flame-badge">
                        <Flame size={12} className="trk-island-flame-icon" />
                        <span>Live</span>
                      </div>
                    </div>

                    <h3 className="trk-island-focus-title">{focusTask.titre}</h3>

                    <div className="trk-island-focus-stats">
                      <div className="trk-island-stat-box">
                        <span className="trk-island-stat-label">Elapsed</span>
                        <span className="trk-island-stat-val trk-mono">{elapsedTimer}</span>
                      </div>
                      <div className="trk-island-stat-box">
                        <span className="trk-island-stat-label">Total</span>
                        <span className="trk-island-stat-val trk-mono">
                          {formatDuration(
                            focusTask.timeLogs?.reduce((acc, l) => acc + (l.minutes || 0), 0) || 0
                          )}
                        </span>
                      </div>
                    </div>

                    <div className="trk-island-focus-actions">
                      <button
                        type="button"
                        className="trk-island-action-btn primary"
                        onClick={() => {
                          advanceFocusTask?.();
                          setOpen(false);
                        }}
                      >
                        <Check size={14} />
                        <span>Done</span>
                      </button>

                      {onEditTask && (
                        <button
                          type="button"
                          className="trk-island-action-btn"
                          onClick={() => {
                            onEditTask(focusTask);
                            setOpen(false);
                          }}
                        >
                          <ExternalLink size={13} />
                          <span>Edit</span>
                        </button>
                      )}

                      <button
                        type="button"
                        className="trk-island-action-btn danger"
                        onClick={() => {
                          releaseFocus?.();
                          setMode("timer");
                        }}
                      >
                        <RotateCcw size={13} />
                        <span>Release</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 4. DEBUG ── */}
              {mode === "debug" && (
                <div className="trk-island-debug-panel">
                  <div className="trk-debug-toolbar">
                    <span className={"trk-island-dot " + debugLevel} />
                    <Bug size={13} className="trk-island-icon" />
                    <input
                      className="trk-debug-filter"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder={t("debug_console_filter_placeholder")}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="trk-island-btn"
                      onClick={clearLog}
                      title={t("debug_console_clear")}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="trk-debug-body" ref={bodyRef}>
                    {shownLogs.length === 0 && (
                      <div className="trk-debug-empty">{t("debug_console_empty")}</div>
                    )}
                    {shownLogs.map((e) => (
                      <div key={e.id} className={"trk-debug-line trk-debug-" + e.level}>
                        <span className="trk-debug-time">{e.at.slice(11, 19)}</span>
                        <span className="trk-debug-source">{e.source}</span>
                        <span className="trk-debug-text">{e.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 5. PERF (DEV ONLY) ── */}
              {isDev && mode === "perf" && perfState && (
                <div className="trk-island-perf-panel">
                  <div className="trk-perf-header">
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">INP</span>
                      <span className={"trk-perf-val " + perfState.rating}>
                        {perfState.lastLatency !== null ? `${perfState.lastLatency}ms` : "—"}
                      </span>
                    </div>
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">Avg</span>
                      <span className="trk-perf-val">
                        {perfState.avgLatency ? `${perfState.avgLatency}ms` : "0ms"}
                      </span>
                    </div>
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">Peak</span>
                      <span className={"trk-perf-val " + (perfState.maxLatency > 50 ? "warn" : "ok")}>
                        {perfState.maxLatency ? `${perfState.maxLatency}ms` : "0ms"}
                      </span>
                    </div>
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">FPS</span>
                      <span className="trk-perf-val highlight">{perfState.fps}</span>
                    </div>
                  </div>

                  <div className="trk-perf-toolbar">
                    <span className="trk-perf-rating-badge">
                      {perfState.rating === "fast"
                        ? "< 16ms"
                        : perfState.rating === "good"
                          ? "< 50ms"
                          : "> 50ms"}
                    </span>
                    <button
                      type="button"
                      className="trk-island-btn"
                      onClick={clearPerfMetrics}
                      title="Clear"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="trk-perf-list">
                    {perfState.interactions.length === 0 ? (
                      <div className="trk-perf-empty">No interactions yet.</div>
                    ) : (
                      perfState.interactions.map((it) => (
                        <div key={it.id} className={"trk-perf-row " + it.status}>
                          <span className="trk-perf-type">{it.type}</span>
                          <span className="trk-perf-target" title={it.target}>{it.target}</span>
                          <span className="trk-perf-duration">{it.duration}ms</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
