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
import { playAppleChime, playHapticTick, playPhaseSwitchChime } from "../../lib/audioFx";
import { getOrCreatePetDna, regeneratePetDna } from "../../lib/petGenerator";
import { DigitalClock } from "./DigitalClock.jsx";
import { PixelHelper } from "./PixelHelper.jsx";
import { PomodoroTimer, PRESETS } from "./PomodoroTimer.jsx";

// Calcul du temps exact HH:MM:SS ou MM:SS pour le chronomètre de focus
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

export function DynamicIsland({ focusSession, onEditTask }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("timer"); // "timer" | "pet" | "focus" | "debug"
  const [hovered, setHovered] = useState(false);
  const hoverTimerRef = useRef(null);
  const [now, setNow] = useState(() => Date.now());

  // ── Compagnon Unique Généré & Persistant ──
  const [petDna, setPetDna] = useState(() => getOrCreatePetDna());
  const [petMood, setPetMood] = useState("normal");
  const [petEnergy, setPetEnergy] = useState(96);
  const [petBond, setPetBond] = useState(4);

  // ── Chronomètre Pomodoro persistant en arrière-plan ──
  const [timerSubTab, setTimerSubTab] = useState("pomodoro"); // "pomodoro" | "flipclock"
  const [pomoPreset, setPomoPreset] = useState(PRESETS[0]);
  const [pomoPhase, setPomoPhase] = useState("focus"); // "focus" | "rest"
  const [pomoTimeLeft, setPomoTimeLeft] = useState(PRESETS[0].focus);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoSound, setPomoSound] = useState(true);
  const [pomoCycle, setPomoCycle] = useState(1);

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

  // Debug state
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("");
  const [pulse, setPulse] = useState(0);
  const bodyRef = useRef(null);
  const islandRef = useRef(null);
  const lastLen = useRef(0);

  // Latency & INP Perf state
  const [perfState, setPerfState] = useState(() => getPerfState());

  useEffect(() => {
    return subscribePerf(setPerfState);
  }, []);

  // Focus session props
  const {
    focusTask,
    focusStartedAt,
    advanceFocusTask,
    releaseFocus,
  } = focusSession || {};

  const isCooking = !!(focusTask && focusStartedAt);
  const isPomoActive = pomoRunning || pomoTimeLeft < (pomoPhase === "focus" ? pomoPreset.focus : pomoPreset.rest);

  // Décompte du chronomètre Pomodoro en arrière-plan (continue même quand l'îlot est fermé)
  useEffect(() => {
    if (!pomoRunning) return;

    const interval = setInterval(() => {
      setPomoTimeLeft((prev) => {
        if (prev <= 1) {
          const nextPhase = pomoPhase === "focus" ? "rest" : "focus";
          const nextDuration = nextPhase === "focus" ? pomoPreset.focus : pomoPreset.rest;

          if (pomoSound) {
            if (nextPhase === "rest") {
              playAppleChime();
            } else {
              playPhaseSwitchChime();
            }
          }

          if (nextPhase === "focus") {
            setPomoCycle((c) => c + 1);
          }

          setPomoPhase(nextPhase);
          setPetMood(nextPhase === "focus" ? "focused" : "happy");
          setPulse((p) => p + 1);
          return nextDuration;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [pomoRunning, pomoPhase, pomoPreset, pomoSound]);

  // Actions Pomodoro
  const handleSelectPomoPreset = (p) => {
    if (pomoSound) playHapticTick();
    setPomoPreset(p);
    setPomoPhase("focus");
    setPomoTimeLeft(p.focus);
    setPomoRunning(false);
  };

  const handleTogglePomoPlay = (e) => {
    if (e) e.stopPropagation();
    if (pomoSound) playHapticTick();
    setPomoRunning((r) => {
      const next = !r;
      if (next) {
        setPetMood(pomoPhase === "focus" ? "focused" : "happy");
      } else if (!isCooking) {
        setPetMood("normal");
      }
      return next;
    });
  };

  const handleSkipPomoPhase = () => {
    if (pomoSound) playHapticTick();
    const nextPhase = pomoPhase === "focus" ? "rest" : "focus";
    const nextDuration = nextPhase === "focus" ? pomoPreset.focus : pomoPreset.rest;
    setPomoPhase(nextPhase);
    setPomoTimeLeft(nextDuration);
    if (nextPhase === "focus") {
      setPomoCycle((c) => c + 1);
    }
    setPetMood(nextPhase === "focus" ? "focused" : "happy");
  };

  const handleResetPomo = () => {
    if (pomoSound) playHapticTick();
    setPomoRunning(false);
    setPomoPhase("focus");
    setPomoTimeLeft(pomoPreset.focus);
    if (!isCooking) setPetMood("normal");
  };

  const pomoMins = Math.floor(pomoTimeLeft / 60);
  const pomoSecs = pomoTimeLeft % 60;
  const pomoFormatted = `${String(pomoMins).padStart(2, "0")}:${String(pomoSecs).padStart(2, "0")}`;

  // Capture et souscription console de log
  useEffect(() => {
    installHostConsoleCapture();
    return subscribeLog(setEntries);
  }, []);

  // Pulse quand un nouveau log arrive en mode compact
  useEffect(() => {
    if (entries.length > lastLen.current && !open) {
      setPulse(1);
      const t = setTimeout(() => setPulse(0), 450);
      lastLen.current = entries.length;
      return () => clearTimeout(t);
    }
    lastLen.current = entries.length;
  }, [entries, open]);

  // Scroll automatique des logs
  useEffect(() => {
    if (open && mode === "debug" && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [entries, open, mode]);

  // Tick chaque seconde si une tâche est en focus ou si l'îlot est ouvert
  useEffect(() => {
    if (!isCooking && !open) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isCooking, open]);

  // Si une tâche entre en focus, basculer petMood
  useEffect(() => {
    if (isCooking || (pomoRunning && pomoPhase === "focus")) {
      setPetMood("focused");
    } else if (pomoRunning && pomoPhase === "rest") {
      setPetMood("happy");
    } else {
      setPetMood("normal");
    }
  }, [isCooking, pomoRunning, pomoPhase]);

  // Fermeture par Escape
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

  // Fermeture au clic en dehors
  useOutsideClick(
    islandRef,
    () => {
      setOpen(false);
      setHovered(false);
    },
    open || hovered
  );

  // Filtrage logs debug
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

  // Actions d'interaction avec le compagnon cybernétique
  const handlePetAction = (action) => {
    if (action === "pet") {
      setPetMood("love");
      setPetBond((b) => b + 1);
      setTimeout(() => setPetMood(isCooking || pomoRunning ? "focused" : "normal"), 2000);
    } else if (action === "feed") {
      setPetMood("eating");
      setPetEnergy(100);
      setTimeout(() => setPetMood("happy"), 1500);
      setTimeout(() => setPetMood(isCooking || pomoRunning ? "focused" : "normal"), 3200);
    } else if (action === "visor") {
      setPetMood("visor");
    } else if (action === "radar") {
      setPetMood("radar");
    } else if (action === "sleep") {
      setPetMood("sleepy");
    } else if (action === "reroll") {
      const newDna = regeneratePetDna();
      setPetDna(newDna);
      playAppleChime();
      setPetMood("happy");
      setTimeout(() => setPetMood(isCooking || pomoRunning ? "focused" : "normal"), 2200);
    } else if (action === "track") {
      setPetMood("normal");
    }
  };

  const hasLiveRight = isCooking || isPomoActive;

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
        {/* ═══════════════════════════════════════════════════════
           ÉTAT FERMÉ UNIFIÉ (!open) : COMPACT ET SURVOL PROGRESSIF
           - Spatialement stable : zéro saut ni téléportation d'éléments au survol
           - Horloge TOUJOURS à gauche (clic -> flipclock & timer)
           - Nova TOUJOURS au centre exact (clic -> pet deck)
           - Droite : Activités en direct (Pomodoro / Tâche Focus) + Debug
           - Au survol : élargissement fluide avec maintien des contrôles (Play/Pause intact)
           ═══════════════════════════════════════════════════════ */}
        {!open && (
          <div className="trk-island-compact-view">
            <div className="trk-island-compact-triad">
              {/* GAUCHE : Horloge mécanique flip */}
              <div
                className="trk-island-triad-left"
                onClick={() => {
                  setMode("timer");
                  setTimerSubTab("flipclock");
                  setOpen(true);
                }}
                role="button"
                tabIndex={0}
                title="Open Flip Clock & Timer"
              >
                <DigitalClock className="trk-island-clock-mini" />
              </div>

              {/* CENTRE : Bot TOUJOURS AU MILIEU PARFAIT (50% absolu) */}
              <div className="trk-island-center-bot">
                <PixelHelper
                  size={34}
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

              {/* DROITE : Live Activities (Timer / Focus) + Contrôles & Diagnostics */}
              <div className="trk-island-triad-right">
                {/* Raccourci Quick Timer si aucun timer n'est actif, uniquement au survol */}
                {!isPomoActive && !isCooking && (
                  <button
                    type="button"
                    className={
                      "trk-island-compact-action" +
                      (!hovered ? " collapsed" : "")
                    }
                    onClick={() => {
                      setMode("timer");
                      setTimerSubTab("pomodoro");
                      setOpen(true);
                    }}
                    title="Start Pomodoro Timer"
                    tabIndex={hovered ? 0 : -1}
                  >
                    <Clock size={11} />
                    <span>Timer</span>
                  </button>
                )}

                {/* Pilule Pomodoro en direct : Reste STRICTEMENT à droite, avec play/pause toujours accessible */}
                {isPomoActive && (
                  <div
                    className={
                      "trk-island-pomo-pill " +
                      pomoPhase +
                      (pomoRunning ? " running" : " paused")
                    }
                    onClick={() => {
                      setMode("timer");
                      setTimerSubTab("pomodoro");
                      setOpen(true);
                    }}
                    role="button"
                    tabIndex={0}
                    title={`${pomoPhase === "focus" ? "Focus" : "Rest"} Timer · ${pomoFormatted}`}
                  >
                    <button
                      type="button"
                      className="trk-island-pomo-mini-toggle"
                      onClick={handleTogglePomoPlay}
                      title={pomoRunning ? "Pause timer" : "Resume timer"}
                      aria-label={pomoRunning ? "Pause timer" : "Resume timer"}
                    >
                      {pomoRunning ? <Pause size={9} /> : <Play size={9} />}
                    </button>
                    <span className="trk-island-compact-timer trk-mono">{pomoFormatted}</span>
                  </div>
                )}

                {/* Pilule Focus Task : Reste à droite, titre animé continûment en CSS */}
                {isCooking && (
                  <div
                    className="trk-island-focus-pill"
                    onClick={() => {
                      setMode("focus");
                      setOpen(true);
                    }}
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

                {/* Console Debug : toujours présente dans le DOM pour transition CSS sans à-coup */}
                <div
                  className={
                    "trk-island-compact-debug" +
                    (hasLiveRight && !hovered ? " collapsed" : "")
                  }
                  onClick={() => {
                    setMode("debug");
                    setOpen(true);
                  }}
                  role="button"
                  tabIndex={hasLiveRight && !hovered ? -1 : 0}
                  title="Open Debug Console"
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

        {/* ═══════════════════════════════════════════════════════
           3. ÉTAT PLEIN ÉCRAN / FEUILLE OUVERTE (open === true)
           - Barre de navigation supérieure épurée (zéro retour à la ligne)
           - Contenu riche : Pomodoro / Nova / Focus / Debug
           ═══════════════════════════════════════════════════════ */}
        {open && (
          <div className="trk-island-expanded-view">
            {/* Barre supérieure centrée de l'encoche */}
            <div className="trk-island-nav">
              <div
                className="trk-island-nav-clock"
                onClick={() => {
                  setMode("timer");
                  setTimerSubTab("flipclock");
                }}
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

                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "perf"}
                  className={"trk-island-tab perf-tab" + (mode === "perf" ? " active" : "")}
                  onClick={() => setMode("perf")}
                >
                  <span className={"trk-island-mini-dot " + (perfState.rating === "fast" ? "ok" : perfState.rating === "good" ? "warn" : "error")} />
                  <Activity size={12} />
                  <span>Latency</span>
                  <span className="trk-island-badge">
                    {perfState.lastLatency !== null ? `${Math.round(perfState.lastLatency)}ms` : `${perfState.fps}fps`}
                  </span>
                </button>
              </div>

              <button
                type="button"
                className="trk-island-close-btn"
                onClick={() => {
                  setOpen(false);
                  setHovered(false);
                }}
                title="Collapse Island (Esc)"
                aria-label="Collapse Island"
              >
                <ChevronUp size={14} />
              </button>
            </div>

            {/* Contenu selon l'onglet actif */}
            <div className="trk-island-sheet">
              {/* ── 1. ONGLET TIMER & FOCUS POMODORO ── */}
              {mode === "timer" && (
                <PomodoroTimer
                  subTab={timerSubTab}
                  onSubTabChange={setTimerSubTab}
                  preset={pomoPreset}
                  phase={pomoPhase}
                  timeLeft={pomoTimeLeft}
                  isRunning={pomoRunning}
                  soundEnabled={pomoSound}
                  cycleCount={pomoCycle}
                  onSelectPreset={handleSelectPomoPreset}
                  onTogglePlay={() => handleTogglePomoPlay()}
                  onSkipPhase={handleSkipPomoPhase}
                  onReset={handleResetPomo}
                  onToggleSound={() => setPomoSound((s) => !s)}
                />
              )}

              {/* ── 2. ONGLET CYBER COMPANION PET DECK ── */}
              {mode === "pet" && (
                <div className="trk-island-pet-deck">
                  {/* Zone Avatar 2.5D & Télémétrie */}
                  <div className="trk-island-pet-stage-box">
                    <div className="trk-island-pet-hero-avatar">
                      <PixelHelper
                        size={72}
                        mood={petMood}
                        dna={petDna}
                        onClick={() => handlePetAction("pet")}
                      />
                    </div>
                    <div className="trk-island-pet-hero-info">
                      <div className="trk-island-pet-hero-title">
                        <h3>{petDna.name}</h3>
                        <span className="trk-island-pet-status-pill">
                          <span className="trk-island-pulse-dot" /> Online
                        </span>
                        <button
                          type="button"
                          className="trk-island-pet-dna-btn"
                          onClick={() => handlePetAction("reroll")}
                          title="Synthesize new unique companion DNA & traits"
                        >
                          <Dna size={12} />
                          <span>Re-roll DNA</span>
                        </button>
                      </div>
                      <p className="trk-island-pet-subtitle">
                        {petDna.archetype} · {petDna.personality}
                      </p>

                      <div className="trk-island-pet-telemetry">
                        <div className="trk-island-telemetry-item">
                          <span className="trk-telemetry-label">Palette</span>
                          <span
                            className="trk-telemetry-val trk-mono"
                            style={{ color: petDna.palette?.neon || "#00F5D4" }}
                          >
                            {petDna.palette?.name || "Cyber"}
                          </span>
                        </div>
                        <div className="trk-island-telemetry-item">
                          <span className="trk-telemetry-label">Core</span>
                          <div className="trk-telemetry-bar">
                            <div className="trk-telemetry-fill" style={{ width: `${petEnergy}%` }} />
                          </div>
                          <span className="trk-telemetry-val trk-mono">{petEnergy}%</span>
                        </div>
                        <div className="trk-island-telemetry-item">
                          <span className="trk-telemetry-label">Bond</span>
                          <span className="trk-telemetry-val trk-mono">LVL {petBond}</span>
                        </div>
                        <div className="trk-island-telemetry-item">
                          <span className="trk-telemetry-label">Sync</span>
                          <span className="trk-telemetry-val synced">
                            <span className="trk-island-pulse-dot" style={{ width: 5, height: 5 }} />{" "}
                            Active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Console de commandes tactiles */}
                  <div className="trk-island-interaction-deck">
                    <span className="trk-deck-label">Tactile Command Matrix</span>
                    <div className="trk-pet-command-grid">
                      <button
                        type="button"
                        className={"trk-pet-command-btn" + (petMood === "love" ? " active" : "")}
                        onClick={() => handlePetAction("pet")}
                      >
                        <div className="trk-command-icon-box">
                          <Sparkles size={15} />
                        </div>
                        <div className="trk-command-texts">
                          <span className="trk-command-title">Pet & Bond</span>
                          <span className="trk-command-sub">Heart Sparks</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={"trk-pet-command-btn" + (petMood === "eating" ? " active" : "")}
                        onClick={() => handlePetAction("feed")}
                      >
                        <div className="trk-command-icon-box zap">
                          <Zap size={15} />
                        </div>
                        <div className="trk-command-texts">
                          <span className="trk-command-title">Power Feed</span>
                          <span className="trk-command-sub">100% Core</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={"trk-pet-command-btn" + (petMood === "visor" ? " active" : "")}
                        onClick={() => handlePetAction("visor")}
                      >
                        <div className="trk-command-icon-box visor">
                          <Shield size={15} />
                        </div>
                        <div className="trk-command-texts">
                          <span className="trk-command-title">Focus Visor</span>
                          <span className="trk-command-sub">Laser Mode</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={"trk-pet-command-btn" + (petMood === "radar" ? " active" : "")}
                        onClick={() => handlePetAction("radar")}
                      >
                        <div className="trk-command-icon-box radar">
                          <Compass size={15} />
                        </div>
                        <div className="trk-command-texts">
                          <span className="trk-command-title">Cursor Radar</span>
                          <span className="trk-command-sub">Lock-On</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className={"trk-pet-command-btn" + (petMood === "sleepy" ? " active" : "")}
                        onClick={() => handlePetAction("sleep")}
                      >
                        <div className="trk-command-icon-box moon">
                          <Moon size={15} />
                        </div>
                        <div className="trk-command-texts">
                          <span className="trk-command-title">Standby</span>
                          <span className="trk-command-sub">Sleep Mode</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        className="trk-pet-command-btn dna-command-btn"
                        onClick={() => handlePetAction("reroll")}
                        title="Re-synthesize unique cyber pet DNA"
                      >
                        <div className="trk-command-icon-box dna">
                          <Dna size={15} />
                        </div>
                        <div className="trk-command-texts">
                          <span className="trk-command-title">New DNA</span>
                          <span className="trk-command-sub">Re-roll</span>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 3. ONGLET FOCUS LIVE ACTIVITY ── */}
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
                        <Flame size={13} className="trk-island-flame-icon" />
                        <span>Live Session</span>
                      </div>
                    </div>

                    <h3 className="trk-island-focus-title">{focusTask.titre}</h3>

                    <div className="trk-island-focus-stats">
                      <div className="trk-island-stat-box">
                        <span className="trk-island-stat-label">Session Elapsed</span>
                        <span className="trk-island-stat-val trk-mono">{elapsedTimer}</span>
                      </div>
                      <div className="trk-island-stat-box">
                        <span className="trk-island-stat-label">Total Logged</span>
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
                        <span>Advance / Done</span>
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
                          <span>Edit Task</span>
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

              {/* ── 4. ONGLET DEBUG CONSOLE ── */}
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

              {/* ── 5. ONGLET LATENCE & INP PERFORMANCE ── */}
              {mode === "perf" && (
                <div className="trk-island-perf-panel">
                  <div className="trk-perf-header">
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">INP (Last)</span>
                      <span className={"trk-perf-val " + perfState.rating}>
                        {perfState.lastLatency !== null ? `${perfState.lastLatency}ms` : "—"}
                      </span>
                    </div>
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">Avg Latency</span>
                      <span className="trk-perf-val">
                        {perfState.avgLatency ? `${perfState.avgLatency}ms` : "0ms"}
                      </span>
                    </div>
                    <div className="trk-perf-stat-card">
                      <span className="trk-perf-label">Max Spike</span>
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
                        ? "⚡ 60/120fps Instant (<16ms)"
                        : perfState.rating === "good"
                          ? "✨ Smooth (<50ms)"
                          : "⚠️ Main thread lag (>50ms)"}
                    </span>
                    <button
                      type="button"
                      className="trk-island-btn"
                      onClick={clearPerfMetrics}
                      title="Clear Latency History"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="trk-perf-list">
                    {perfState.interactions.length === 0 ? (
                      <div className="trk-perf-empty">No interactions recorded yet. Click or drag to inspect latency.</div>
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
}
