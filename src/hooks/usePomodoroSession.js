import { useEffect, useRef, useState } from "react";
import { playAppleChime, playHapticTick, playPhaseSwitchChime } from "../lib/audioFx";
import { PRESETS } from "../components/DynamicIsland/PomodoroTimer.jsx";

// Chronomètre Pomodoro partagé : une seule instance dans App, consommée par
// la Dynamic Island ET par le pet flottant du bureau (fenêtre réduite).
// `onMoodChange` reçoit l'humeur du pet correspondante :
// "focused" | "happy" | "normal".
export function usePomodoroSession({ onMoodChange } = {}) {
  const [timerSubTab, setTimerSubTab] = useState("pomodoro"); // "pomodoro" | "flipclock"
  const [preset, setPreset] = useState(PRESETS[0]);
  const [phase, setPhase] = useState("focus"); // "focus" | "rest"
  const [timeLeft, setTimeLeft] = useState(PRESETS[0].focus);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [cycleCount, setCycleCount] = useState(1);

  // Ref : un callback recréé à chaque rendu ne doit pas réarmer l'intervalle.
  const moodRef = useRef(onMoodChange);
  moodRef.current = onMoodChange;
  const emitMood = (mood) => moodRef.current?.(mood);

  // Horodatage de fin de phase : le décompte est calculé depuis l'horloge
  // (pas par décrément), donc il reste exact même si la fenêtre réduite voit
  // ses timers ralentis par le navigateur — et le pet flottant peut l'afficher
  // en autonomie à partir de `endsAt`.
  const endsAtRef = useRef(null);

  useEffect(() => {
    if (!isRunning) return;
    if (!endsAtRef.current) endsAtRef.current = Date.now() + timeLeft * 1000;

    const interval = setInterval(() => {
      const remaining = Math.ceil((endsAtRef.current - Date.now()) / 1000);
      if (remaining > 0) {
        setTimeLeft(remaining);
        return;
      }
      const nextPhase = phase === "focus" ? "rest" : "focus";
      const nextDuration = nextPhase === "focus" ? preset.focus : preset.rest;

      if (soundEnabled) {
        if (nextPhase === "rest") playAppleChime();
        else playPhaseSwitchChime();
      }
      if (nextPhase === "focus") setCycleCount((c) => c + 1);

      endsAtRef.current = Date.now() + nextDuration * 1000;
      setPhase(nextPhase);
      setTimeLeft(nextDuration);
      emitMood(nextPhase === "focus" ? "focused" : "happy");
    }, 250);

    return () => clearInterval(interval);
    // timeLeft volontairement absent : seul l'horodatage pilote le décompte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, phase, preset, soundEnabled]);

  const selectPreset = (newPreset) => {
    if (soundEnabled) playHapticTick();
    endsAtRef.current = null;
    setPreset(newPreset);
    setPhase("focus");
    setTimeLeft(newPreset.focus);
    setIsRunning(false);
  };

  const togglePlay = (e) => {
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (soundEnabled) playHapticTick();
    const next = !isRunning;
    endsAtRef.current = next ? Date.now() + timeLeft * 1000 : null;
    setIsRunning(next);
    emitMood(next ? (phase === "focus" ? "focused" : "happy") : "normal");
  };

  const skipPhase = () => {
    if (soundEnabled) playHapticTick();
    const nextPhase = phase === "focus" ? "rest" : "focus";
    const nextDuration = nextPhase === "focus" ? preset.focus : preset.rest;
    if (nextPhase === "focus") setCycleCount((c) => c + 1);
    endsAtRef.current = isRunning ? Date.now() + nextDuration * 1000 : null;
    setPhase(nextPhase);
    setTimeLeft(nextDuration);
    emitMood(nextPhase === "focus" ? "focused" : "happy");
  };

  const reset = () => {
    if (soundEnabled) playHapticTick();
    endsAtRef.current = null;
    setIsRunning(false);
    setPhase("focus");
    setTimeLeft(preset.focus);
    emitMood("normal");
  };

  const toggleSound = () => {
    playHapticTick();
    setSoundEnabled((s) => !s);
  };

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const totalPhaseSec = phase === "focus" ? preset.focus : preset.rest;
  const progressPercent = Math.min(100, Math.max(0, ((totalPhaseSec - timeLeft) / totalPhaseSec) * 100));

  const isPomoActive = isRunning || timeLeft < totalPhaseSec;

  return {
    preset,
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
    togglePlay,
    skipPhase,
    reset,
    toggleSound,
  };
}
