import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { playAppleChime, playHapticTick, playPhaseSwitchChime } from "../lib/audioFx";
import { createUnthrottledInterval } from "../lib/timerWorker.js";
import { PRESETS } from "../components/DynamicIsland/PomodoroTimer.jsx";

export function formatPomodoroTime(totalSec) {
  const sec = Math.max(0, Math.floor(totalSec));
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

// Chronomètre Pomodoro partagé : une seule instance dans App, consommée par
// la Dynamic Island ET par le pet flottant du bureau (fenêtre réduite).
// Lorsque `trackTimeInState` vaut `false` (cas de App.jsx), le décompte par
// seconde est diffusé via `subscribeTick`/`getTimeLeft` sans re-rendre toute
// l'application à chaque seconde — seuls les afficheurs numériques abonnés
// via `usePomodoroTimeLeft` se mettent à jour.
export function usePomodoroSession({ onMoodChange, trackTimeInState = true } = {}) {
  const [timerSubTab, setTimerSubTab] = useState("pomodoro"); // "pomodoro" | "flipclock"
  const [activePreset, setActivePreset] = useState(PRESETS[0]);
  const [viewedPreset, setViewedPreset] = useState(PRESETS[0]);
  const [phase, setPhase] = useState("focus"); // "focus" | "rest"
  const [timeLeftState, setTimeLeftState] = useState(PRESETS[0].focus);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cycleCount, setCycleCount] = useState(1);
  const [hasStarted, setHasStarted] = useState(false);

  const timeLeftRef = useRef(PRESETS[0].focus);
  const tickListenersRef = useRef(new Set());

  const notifyTick = useCallback((nextSec, forceState = false) => {
    const prev = timeLeftRef.current;
    timeLeftRef.current = nextSec;
    if (trackTimeInState || forceState) {
      setTimeLeftState(nextSec);
    }
    if (prev !== nextSec || forceState) {
      tickListenersRef.current.forEach((cb) => cb());
    }
  }, [trackTimeInState]);

  const subscribeTick = useCallback((cb) => {
    tickListenersRef.current.add(cb);
    return () => {
      tickListenersRef.current.delete(cb);
    };
  }, []);

  const getTimeLeft = useCallback(() => timeLeftRef.current, []);

  const moodRef = useRef(onMoodChange);
  moodRef.current = onMoodChange;
  const emitMood = (mood) => moodRef.current?.(mood);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  const endsAtRef = useRef(null);

  const totalPhaseSec = phase === "focus" ? activePreset.focus : activePreset.rest;
  const isPomoActive = isRunning || phase !== "focus" || hasStarted || timeLeftState < totalPhaseSec;
  const isPomoActiveRef = useRef(isPomoActive);
  isPomoActiveRef.current = isPomoActive;

  useEffect(() => {
    if (!isRunning) return;
    if (!endsAtRef.current) endsAtRef.current = Date.now() + timeLeftRef.current * 1000;

    const ticker = createUnthrottledInterval(() => {
      if (!endsAtRef.current) return;
      const remaining = Math.ceil((endsAtRef.current - Date.now()) / 1000);
      if (remaining > 0) {
        if (remaining !== timeLeftRef.current) {
          notifyTick(remaining, false);
        }
        return;
      }
      const nextPhase = phase === "focus" ? "rest" : "focus";
      const nextDuration = nextPhase === "focus" ? activePreset.focus : activePreset.rest;

      if (soundRef.current) {
        if (nextPhase === "rest") playAppleChime();
        else playPhaseSwitchChime();
      }
      if (nextPhase === "focus") setCycleCount((c) => c + 1);

      endsAtRef.current = Date.now() + nextDuration * 1000;
      setPhase(nextPhase);
      notifyTick(nextDuration, true);
      emitMood(nextPhase === "focus" ? "focused" : "happy");
    }, 250);

    return () => ticker.clear();
  }, [isRunning, phase, activePreset, notifyTick]);

  const selectPreset = useCallback(
    (newPreset) => {
      if (soundRef.current) playHapticTick();
      if (!isPomoActiveRef.current) {
        endsAtRef.current = null;
        setActivePreset(newPreset);
        setViewedPreset(newPreset);
        setPhase("focus");
        setHasStarted(false);
        notifyTick(newPreset.focus, true);
        setIsRunning(false);
        return;
      }
      setViewedPreset(newPreset);
    },
    [notifyTick]
  );

  const returnToActivePreset = useCallback(() => {
    setViewedPreset(activePreset);
  }, [activePreset]);

  const togglePlay = useCallback(
    (e) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (soundRef.current) playHapticTick();
      const next = !isRunning;
      const curTimeLeft = timeLeftRef.current;
      endsAtRef.current = next ? Date.now() + curTimeLeft * 1000 : null;
      if (next) {
        isPomoActiveRef.current = true;
        setHasStarted(true);
      } else {
        // Synchronise l'état statique lors d'une pause pour le pet / re-montages
        setTimeLeftState(curTimeLeft);
      }
      setIsRunning(next);
      emitMood(next ? (phase === "focus" ? "focused" : "happy") : "normal");
    },
    [isRunning, phase]
  );

  const startViewedPreset = useCallback(
    (e) => {
      if (viewedPreset.id === activePreset.id) {
        togglePlay(e);
        return;
      }
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (soundRef.current) playHapticTick();
      endsAtRef.current = Date.now() + viewedPreset.focus * 1000;
      isPomoActiveRef.current = true;
      setHasStarted(true);
      setActivePreset(viewedPreset);
      setPhase("focus");
      notifyTick(viewedPreset.focus, true);
      setIsRunning(true);
      emitMood("focused");
    },
    [viewedPreset, activePreset, togglePlay, notifyTick]
  );

  const skipPhase = useCallback(() => {
    if (soundRef.current) playHapticTick();
    const nextPhase = phase === "focus" ? "rest" : "focus";
    const nextDuration = nextPhase === "focus" ? activePreset.focus : activePreset.rest;
    if (nextPhase === "focus") setCycleCount((c) => c + 1);
    endsAtRef.current = isRunning ? Date.now() + nextDuration * 1000 : null;
    isPomoActiveRef.current = isRunning || nextPhase !== "focus";
    setHasStarted(isRunning || nextPhase !== "focus");
    setPhase(nextPhase);
    notifyTick(nextDuration, true);
    setViewedPreset(activePreset);
    emitMood(nextPhase === "focus" ? "focused" : "happy");
  }, [phase, activePreset, isRunning, notifyTick]);

  const reset = useCallback(() => {
    if (soundRef.current) playHapticTick();
    endsAtRef.current = null;
    isPomoActiveRef.current = false;
    setHasStarted(false);
    setIsRunning(false);
    setPhase("focus");
    notifyTick(activePreset.focus, true);
    setViewedPreset(activePreset);
    emitMood("normal");
  }, [activePreset, notifyTick]);

  const toggleSound = useCallback(() => {
    playHapticTick();
    setSoundEnabled((s) => !s);
  }, []);

  const timeFormatted = formatPomodoroTime(timeLeftState);
  const progressPercent = Math.min(100, Math.max(0, ((totalPhaseSec - timeLeftState) / totalPhaseSec) * 100));
  const endsAt = isRunning ? endsAtRef.current : null;

  return useMemo(
    () => ({
      preset: viewedPreset,
      activePreset,
      isViewingOtherPreset: viewedPreset.id !== activePreset.id,
      phase,
      timeLeft: timeLeftState,
      isRunning,
      soundEnabled,
      cycleCount,
      timerSubTab,
      timeFormatted,
      progressPercent,
      isPomoActive,
      totalPhaseSec,
      endsAt,
      subscribeTick,
      getTimeLeft,
      setTimerSubTab,
      selectPreset,
      returnToActivePreset,
      startViewedPreset,
      togglePlay,
      skipPhase,
      reset,
      toggleSound,
    }),
    [
      viewedPreset,
      activePreset,
      phase,
      timeLeftState,
      isRunning,
      soundEnabled,
      cycleCount,
      timerSubTab,
      timeFormatted,
      progressPercent,
      isPomoActive,
      totalPhaseSec,
      endsAt,
      subscribeTick,
      getTimeLeft,
      selectPreset,
      returnToActivePreset,
      startViewedPreset,
      togglePlay,
      skipPhase,
      reset,
      toggleSound,
    ]
  );
}

const noopSubscribe = () => () => {};

/** S'abonne au décompte seconde par seconde sans re-rendre les parents. */
export function usePomodoroTimeLeft(session) {
  const subscribe = session?.subscribeTick || noopSubscribe;
  const getSnapshot = session?.getTimeLeft || (() => session?.timeLeft ?? 0);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
