import { useEffect, useRef, useState } from "react";
import { desktopPet, desktopPetSupported } from "../../services/desktopPet";

/**
 * Composant monté dans la fenêtre principale (`App.jsx`).
 * Il surveille l'état de minimisation de la fenêtre principale.
 * Si l'app est minimisée et le compagnon flottant activé, il affiche
 * la fenêtre transparente du pet de bureau au-dessus de la barre des tâches
 * et synchronise en temps réel les données de tâche et de timer.
 */
export function DesktopPetSync({
  enabled = true,
  focusTask,
  focusStartedAt,
  pomodoro,
  petDna,
  theme,
}) {
  const [isMainMinimized, setIsMainMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const stateRef = useRef(null);
  const pomodoroRef = useRef(pomodoro);
  pomodoroRef.current = pomodoro;

  // Construction de l'état actuel à envoyer au pet
  const currentState = {
    petDna,
    theme: theme || "dark",
    mood: pomodoro?.isRunning
      ? pomodoro.phase === "rest"
        ? "happy"
        : "focused"
      : focusTask
        ? "focused"
        : "normal",
    focus: focusTask ? { title: focusTask.titre, project: focusTask.projet } : null,
    focusStartedAt: focusStartedAt || null,
    pomo: pomodoro
      ? {
          phase: pomodoro.phase || "focus",
          timeLeft: pomodoro.timeLeft ?? 1500,
          total: pomodoro.totalPhaseSec || 1500,
          isRunning: Boolean(pomodoro.isRunning),
          isPomoActive: Boolean(pomodoro.isPomoActive),
          endsAt: pomodoro.endsAt || null,
        }
      : null,
  };
  stateRef.current = currentState;

  // Affichage dès que l'app est réduite, que le compagnon est activé et non fermé manuellement
  const shouldShow = enabled && isMainMinimized && !isDismissed;

  // Réinitialisation robuste de l'état de rejet dès que la fenêtre principale reprend le focus ou redevient visible
  useEffect(() => {
    const handleRestoreEvent = () => {
      setIsMainMinimized(false);
      setIsDismissed(false);
    };

    window.addEventListener("focus", handleRestoreEvent);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleRestoreEvent();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleRestoreEvent);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Écoute des événements IPC de la fenêtre principale et du pet
  useEffect(() => {
    if (!desktopPetSupported()) return;

    const unlistenMinimized = desktopPet.onMainMinimizedChanged((minimized) => {
      setIsMainMinimized(minimized);
      // À chaque changement d'état de minimisation (restauration ou nouvelle minimisation),
      // on réarme le pet pour qu'il réapparaisse toujours de façon prévisible.
      setIsDismissed(false);
    });

    const unlistenReady = desktopPet.onReady(() => {
      if (stateRef.current) {
        desktopPet.sendState(stateRef.current);
      }
    });

    const unlistenAction = desktopPet.onAction((action) => {
      if (action.type === "togglePomo") {
        pomodoroRef.current?.togglePlay();
      } else if (action.type === "dismiss") {
        setIsDismissed(true);
        desktopPet.hide();
      } else if (action.type === "restoreMain") {
        setIsDismissed(false);
      }
    });

    return () => {
      unlistenMinimized();
      unlistenReady();
      unlistenAction();
    };
  }, []);

  // Déclenche l'affichage ou le masquage de la fenêtre du pet
  useEffect(() => {
    if (!desktopPetSupported()) return;

    if (shouldShow) {
      desktopPet.show();
      if (stateRef.current) desktopPet.sendState(stateRef.current);
    } else {
      desktopPet.hide();
    }
  }, [shouldShow, isMainMinimized, enabled]);

  // Diffusion continue de l'état quand le pet est affiché
  useEffect(() => {
    if (!desktopPetSupported() || !shouldShow) return;
    if (stateRef.current) desktopPet.sendState(stateRef.current);
  }, [
    shouldShow,
    focusTask?.titre,
    focusTask?.projet,
    focusStartedAt,
    pomodoro?.phase,
    pomodoro?.timeLeft,
    pomodoro?.isRunning,
    pomodoro?.isPomoActive,
    pomodoro?.totalPhaseSec,
    pomodoro?.endsAt,
    petDna,
    theme,
  ]);

  return null;
}
