import { useCallback, useEffect, useRef, useState } from "react";
import { playAppleChime, playHapticTick, playPhaseSwitchChime } from "../lib/audioFx";
import { createUnthrottledInterval } from "../lib/timerWorker.js";
import { PRESETS } from "../components/DynamicIsland/PomodoroTimer.jsx";

// Chronomètre Pomodoro partagé : une seule instance dans App, consommée par
// la Dynamic Island ET par le pet flottant du bureau (fenêtre réduite).
// `activePreset` porte la session en cours ; `viewedPreset` permet d'inspecter
// d'autres durées sans arrêter ni réinitialiser un timer déjà démarré.
export function usePomodoroSession({ onMoodChange } = {}) {
  const [timerSubTab, setTimerSubTab] = useState("pomodoro"); // "pomodoro" | "flipclock"
  const [activePreset, setActivePreset] = useState(PRESETS[0]);
  const [viewedPreset, setViewedPreset] = useState(PRESETS[0]);
  const [phase, setPhase] = useState("focus"); // "focus" | "rest"
  const [timeLeft, setTimeLeft] = useState(PRESETS[0].focus);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cycleCount, setCycleCount] = useState(1);

  const moodRef = useRef(onMoodChange);
  moodRef.current = onMoodChange;
  const emitMood = (mood) => moodRef.current?.(mood);

  const soundRef = useRef(soundEnabled);
  soundRef.current = soundEnabled;

  // Horodatage de fin de phase : le décompte est calculé depuis l'horloge
  // (pas par décrément) via un Web Worker non bridé, donc il reste exact
  // même lorsque la fenêtre principale est réduite.
  const endsAtRef = useRef(null);

  const totalPhaseSec = phase === "focus" ? activePreset.focus : activePreset.rest;
  const isPomoActive = isRunning || phase !== "focus" || timeLeft < totalPhaseSec;
  const isPomoActiveRef = useRef(isPomoActive);
  isPomoActiveRef.current = isPomoActive;

  useEffect(() => {
    if (!isRunning) return;
    if (!endsAtRef.current) endsAtRef.current = Date.now() + timeLeft * 1000;

    const ticker = createUnthrottledInterval(() => {
      if (!endsAtRef.current) return;
      const remaining = Math.ceil((endsAtRef.current - Date.now()) / 1000);
      if (remaining > 0) {
        setTimeLeft(remaining);
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
      setTimeLeft(nextDuration);
      emitMood(nextPhase === "focus" ? "focused" : "happy");
    }, 250);

    return () => ticker.clear();
    // timeLeft volontairement absent : seul l'horodatage pilote le décompte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase, activePreset]);

  const selectPreset = useCallback(
    (newPreset) => {
      if (soundRef.current) playHapticTick();
      if (!isPomoActiveRef.current) {
        endsAtRef.current = null;
        setActivePreset(newPreset);
        setViewedPreset(newPreset);
        setPhase("focus");
        setTimeLeft(newPreset.focus);
        setIsRunning(false);
        return;
      }
      // Un timer est déjà démarré : changer d'option bascule uniquement
      // l'aperçu sans jamais arrêter ni réinitialiser la session active.
      setViewedPreset(newPreset);
    },
    []
  );

  const returnToActivePreset = useCallback(() => {
    setViewedPreset(activePreset);
  }, [activePreset]);

  const togglePlay = useCallback(
    (e) => {
      if (e && typeof e.stopPropagation === "function") e.stopPropagation();
      if (soundRef.current) playHapticTick();
      const next = !isRunning;
      endsAtRef.current = next ? Date.now() + timeLeft * 1000 : null;
      if (next) isPomoActiveRef.current = true;
      setIsRunning(next);
      emitMood(next ? (phase === "focus" ? "focused" : "happy") : "normal");
    },
    [isRunning, timeLeft, phase]
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
      setActivePreset(viewedPreset);
      setPhase("focus");
      setTimeLeft(viewedPreset.focus);
      setIsRunning(true);
      emitMood("focused");
    },
    [viewedPreset, activePreset, togglePlay]
  );

  const skipPhase = useCallback(() => {
    if (soundRef.current) playHapticTick();
    const nextPhase = phase === "focus" ? "rest" : "focus";
    const nextDuration = nextPhase === "focus" ? activePreset.focus : activePreset.rest;
    if (nextPhase === "focus") setCycleCount((c) => c + 1);
    endsAtRef.current = isRunning ? Date.now() + nextDuration * 1000 : null;
    isPomoActiveRef.current = isRunning || nextPhase !== "focus";
    setPhase(nextPhase);
    setTimeLeft(nextDuration);
    setViewedPreset(activePreset);
    emitMood(nextPhase === "focus" ? "focused" : "happy");
  }, [phase, activePreset, isRunning]);

  const reset = useCallback(() => {
    if (soundRef.current) playHapticTick();
    endsAtRef.current = null;
    isPomoActiveRef.current = false;
    setIsRunning(false);
    setPhase("focus");
    setTimeLeft(activePreset.focus);
    setViewedPreset(activePreset);
    emitMood("normal");
  }, [activePreset]);

  const toggleSound = useCallback(() => {
    playHapticTick();
    setSoundEnabled((s) => !s);
  }, []);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const progressPercent = Math.min(100, Math.max(0, ((totalPhaseSec - timeLeft) / totalPhaseSec) * 100));

  return {
    preset: viewedPreset,
    activePreset,
    isViewingOtherPreset: viewedPreset.id !== activePreset.id,
    phase,
    timeLeft,
    isRunning,
    soundEnabled,
    cycleCount,
    timerSubTab,
    timeFormatted,
    progressPercent,
    isPomoActive,
    totalPhaseSec,
    endsAt: isRunning ? endsAtRef.current : null,
    setTimerSubTab,
    selectPreset,
    returnToActivePreset,
    startViewedPreset,
    togglePlay,
    skipPhase,
    reset,
    toggleSound,
  };
}
