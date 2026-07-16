import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { Task, TimeLog } from "../../lib/types";
import { isTaskDone, isSimpleTask, statusesForTask } from "../../lib/statuses";
import { focusMinutes } from "../../lib/time";
import { uid } from "../../lib/uid";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

const FOCUS_STORAGE_KEY = "suivi-travaux-focus";
const FOCUS_STARTED_STORAGE_KEY = "suivi-travaux-focus-started";

interface UseFocusSessionArgs {
  loading: boolean;
  tasks: Task[];
  tasksRef: MutableRefObject<Task[]>;
  saveTasks: (next: Task[]) => void;
  moveTask: (id: string, statut: string) => void;
  t: (key: string) => string;
}

export interface FocusSession {
  focusId: string | null;
  focusStartedAt: number | null;
  focusTask: Task | null;
  focusLeaving: boolean;
  focusEnterKey: number;
  focusOnTask: (id: string) => void;
  advanceFocusTask: () => void;
  releaseFocus: () => void;
}

// Session de focus : UNE tâche à la fois, dont le temps est pointé
// automatiquement (plafonné à 8h/jour) à la sortie — libération manuelle,
// échange de tâche, ou sortie animée quand la tâche est terminée.
// Persistée dans localStorage pour survivre au redémarrage de l'app.
export function useFocusSession({ loading, tasks, tasksRef, saveTasks, moveTask, t }: UseFocusSessionArgs): FocusSession {
  const [focusId, setFocusId] = useLocalStorageState<string | null>(FOCUS_STORAGE_KEY, null, {
    read: (raw) => raw || null,
  });
  const [focusStartedAt, setFocusStartedAt] = useLocalStorageState<number | null>(FOCUS_STARTED_STORAGE_KEY, null, {
    read: (raw) => (raw ? parseInt(raw, 10) || null : null),
    write: (v) => (v == null ? null : String(v)),
  });
  const [focusLeaving, setFocusLeaving] = useState(false);
  const [focusEnterKey, setFocusEnterKey] = useState(0);

  const focusTask = useMemo(
    () => tasks.find((tk) => tk.id === focusId) || null,
    [tasks, focusId]
  );

  const focusStartedAtRef = useRef(focusStartedAt);
  focusStartedAtRef.current = focusStartedAt;

  // Pointage : ajoute le temps de focus écoulé à la tâche.
  const logFocusTime = (list: Task[], taskId: string, startedAt: number): Task[] => {
    if (!startedAt || !taskId) return list;
    const minutes = focusMinutes(startedAt, Date.now());
    if (minutes < 1) return list;
    const entry: TimeLog = {
      id: uid(),
      minutes,
      note: t("focus_log_note"),
      date: new Date().toISOString().slice(0, 10),
    };
    return list.map((tk) =>
      tk.id === taskId ? { ...tk, timeLogs: [...(tk.timeLogs || []), entry] } : tk
    );
  };

  // Si la tâche focalisée est supprimée, on libère la zone (sans pointage :
  // la tâche n'existe plus).
  useEffect(() => {
    if (loading) return;
    if (focusId && !focusTask) {
      setFocusId(null);
      setFocusStartedAt(null);
      setFocusLeaving(false);
    }
    if (!focusId && focusStartedAt) setFocusStartedAt(null);
  }, [loading, focusId, focusTask, focusStartedAt]);

  // Sortie automatique (animée) dès que la tâche focalisée est terminée,
  // quel que soit l'endroit où elle a été terminée (kanban, modal, zone).
  // Le temps de focus est pointé au moment de la sortie.
  useEffect(() => {
    if (!focusTask) return;
    if (!isTaskDone(focusTask)) {
      setFocusLeaving(false);
      return;
    }
    setFocusLeaving(true);
    const timer = setTimeout(() => {
      // Lecture via les refs : l'état a pu changer pendant les 900 ms
      // d'animation (tâche ajoutée/éditée), le persister depuis la closure
      // de l'effet perdrait ces modifications.
      const startedAt = focusStartedAtRef.current;
      if (startedAt) saveTasks(logFocusTime(tasksRef.current, focusTask.id, startedAt));
      setFocusId(null);
      setFocusStartedAt(null);
      setFocusLeaving(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [focusTask]);

  const focusOnTask = (id: string) => {
    const task = tasksRef.current.find((tk) => tk.id === id);
    if (!task || isTaskDone(task) || focusLeaving || id === focusId) return;
    // Échange : le temps de la tâche sortante est pointé avant de la remplacer.
    if (focusId && focusStartedAt) saveTasks(logFocusTime(tasksRef.current, focusId, focusStartedAt));
    setFocusId(id);
    setFocusStartedAt(Date.now());
    setFocusEnterKey((k) => k + 1);
  };

  // Tâche simple : passe directement à « done ». Tâche workflow : avance
  // d'un seul statut (la sortie n'a lieu qu'en atteignant « terminé »).
  const advanceFocusTask = () => {
    if (!focusTask) return;
    const seq = statusesForTask(focusTask);
    const idx = seq.findIndex((s) => s.id === focusTask.statut);
    const nextId = isSimpleTask(focusTask)
      ? "done"
      : seq[Math.min(idx + 1, seq.length - 1)]!.id;
    moveTask(focusTask.id, nextId);
  };

  const releaseFocus = () => {
    if (focusId && focusStartedAt) saveTasks(logFocusTime(tasksRef.current, focusId, focusStartedAt));
    setFocusId(null);
    setFocusStartedAt(null);
    setFocusLeaving(false);
  };

  return {
    focusId, focusStartedAt, focusTask, focusLeaving, focusEnterKey,
    focusOnTask, advanceFocusTask, releaseFocus,
  };
}
