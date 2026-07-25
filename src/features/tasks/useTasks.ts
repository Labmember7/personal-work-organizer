import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { Project, Task, TaskDraft, TaskType, TimeLog } from "../../lib/types";
import { isTaskDone, statusesForTask, STATUSES, SIMPLE_STATUSES } from "../../lib/statuses";
import { uid } from "../../lib/uid";
import { loadValue, saveValue, loadConfigProjects, syncConfigProjects } from "../../services/storage";

const STORAGE_KEY = "suivi-travaux-data";

// Bornée pour éviter toute croissance illimitée de la mémoire ; chaque
// entrée ne stocke que des références aux tableaux tasks/projects (mise à
// jour immuable existante), pas de clone profond, donc le surcoût réel par
// entrée est négligeable.
const HISTORY_LIMIT = 100;

interface StoredData {
  tasks?: Task[];
  projects?: Project[];
}

interface Snapshot {
  tasks: Task[];
  projects: Project[];
}

export interface TaskStore {
  loading: boolean;
  tasks: Task[];
  projects: Project[];
  saveError: boolean;
  tasksRef: MutableRefObject<Task[]>;
  projectsRef: MutableRefObject<Project[]>;
  saveTasks: (next: Task[]) => void;
  saveProjects: (next: Project[]) => void;
  saveBoth: (nextTasks: Task[], nextProjects: Project[]) => void;
  upsertTask: (draft: TaskDraft) => void;
  deleteTask: (id: string) => void;
  archiveTask: (id: string) => void;
  unarchiveTask: (id: string) => void;
  moveTask: (id: string, statut: string) => void;
  addTimeLog: (taskId: string, minutes: number, note: string) => void;
  editTimeLog: (taskId: string, logId: string, minutes: number, note: string) => void;
  deleteTimeLog: (taskId: string, logId: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

interface UseTasksOptions {
  /** Appelé quand une tâche vient d'être terminée (déclenche la célébration). */
  onTaskDone?: (statut: string, nextTasks: Task[]) => void;
}

// Source de vérité des données : tâches + projets, chargés au démarrage et
// persistés ensemble (une seule clé du store). Les mutations passent toutes
// par ici.
export function useTasks({ onTaskDone }: UseTasksOptions = {}): TaskStore {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saveError, setSaveError] = useState(false);

  // État "dernier rendu" pour les callbacks différés (setTimeout de la zone
  // de focus) : persister un état capturé plus tôt écraserait les
  // modifications faites entre-temps.
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const onTaskDoneRef = useRef(onTaskDone);
  onTaskDoneRef.current = onTaskDone;

  // Historique undo/redo : piles de références (pas de clone profond),
  // bornées à HISTORY_LIMIT. Des refs suffisent pour les piles elles-mêmes
  // (jamais lues par le rendu) ; seuls canUndo/canRedo sont exposés en état
  // pour piloter l'activation des boutons/raccourcis sans re-render inutile.
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    (async () => {
      let initialProjects: Project[] = [];
      try {
        const configProjects = await loadConfigProjects();
        if (configProjects) initialProjects = configProjects;
      } catch (e) {
        // config.json absent/illisible, on part des valeurs par défaut
      }
      try {
        const parsed = await loadValue<StoredData>(STORAGE_KEY);
        if (parsed) {
          setTasks(parsed.tasks || []);
          setProjects(parsed.projects && parsed.projects.length ? parsed.projects : initialProjects);
        } else {
          setProjects(initialProjects);
        }
      } catch (e) {
        setProjects(initialProjects);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (nextTasks: Task[], nextProjects: Project[]) => {
    try {
      const ok = await saveValue(STORAGE_KEY, { tasks: nextTasks, projects: nextProjects });
      setSaveError(!ok);
    } catch (e) {
      setSaveError(true);
    }
    try {
      await syncConfigProjects(nextProjects);
    } catch (e) {
      // la synchronisation du fichier de config a échoué, la sauvegarde principale reste valide
    }
  };

  // Empile l'état courant avant de le remplacer, pour permettre un undo.
  // Toute nouvelle action invalide la pile de redo (comme un traitement de
  // texte classique).
  const recordHistory = () => {
    pastRef.current.push({ tasks: tasksRef.current, projects: projectsRef.current });
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  };

  const applySnapshot = (snap: Snapshot) => {
    setTasks(snap.tasks);
    setProjects(snap.projects);
    persist(snap.tasks, snap.projects);
  };

  // Les refs évitent toute capture périmée : saveTasks peut être appelé
  // depuis un timer sans risquer de persister d'anciens projets (et
  // inversement pour saveProjects).
  const saveTasks = (next: Task[]) => {
    recordHistory();
    setTasks(next);
    persist(next, projectsRef.current);
  };

  const saveProjects = (next: Project[]) => {
    recordHistory();
    setProjects(next);
    persist(tasksRef.current, next);
  };

  const saveBoth = (nextTasks: Task[], nextProjects: Project[]) => {
    recordHistory();
    setTasks(nextTasks);
    setProjects(nextProjects);
    persist(nextTasks, nextProjects);
  };

  // Undo/redo n'appellent jamais recordHistory : ils déplacent l'état
  // courant vers la pile opposée puis restaurent l'instantané visé.
  const undo = () => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push({ tasks: tasksRef.current, projects: projectsRef.current });
    if (futureRef.current.length > HISTORY_LIMIT) futureRef.current.shift();
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
    applySnapshot(prev);
  };

  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push({ tasks: tasksRef.current, projects: projectsRef.current });
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    setCanRedo(futureRef.current.length > 0);
    setCanUndo(true);
    applySnapshot(next);
  };

  // Création ou édition depuis le modal. En édition, les timeLogs du store
  // font foi : ils sont mutés en direct par les opérations de pointage,
  // le brouillon du modal peut être en retard.
  const upsertTask = (draft: TaskDraft) => {
    if (draft.id) {
      const saved: Task = { ...draft, id: draft.id };
      const prev = tasksRef.current.find((t) => t.id === draft.id);
      const next = tasksRef.current.map((t) =>
        t.id === draft.id ? { ...saved, timeLogs: t.timeLogs || [] } : t
      );
      saveTasks(next);
      if (prev && !isTaskDone(prev) && isTaskDone(saved)) onTaskDoneRef.current?.(saved.statut ?? "", next);
    } else {
      saveTasks([...tasksRef.current, { ...draft, id: uid() }]);
    }
  };

  const deleteTask = (id: string) => {
    saveTasks(tasksRef.current.filter((t) => t.id !== id));
  };

  const archiveTask = (id: string) => {
    saveTasks(tasksRef.current.map((t) => (t.id === id ? { ...t, archived: true } : t)));
  };

  const unarchiveTask = (id: string) => {
    saveTasks(tasksRef.current.map((t) => (t.id === id ? { ...t, archived: false } : t)));
  };

  // Déposer une carte sur une colonne de l'autre tableau (workflow <-> simple)
  // convertit aussi le type de la tâche vers celui du statut cible.
  const moveTask = (id: string, statut: string) => {
    const task = tasksRef.current.find((t) => t.id === id);
    if (!task || task.statut === statut) return;
    let type: TaskType | undefined = task.type;
    if (!statusesForTask(task).some((s) => s.id === statut)) {
      const otherType: TaskType = task.type === "simple" ? "standard" : "simple";
      const otherStatuses = otherType === "simple" ? SIMPLE_STATUSES : STATUSES;
      if (!otherStatuses.some((s) => s.id === statut)) return;
      type = otherType;
    }
    const next = tasksRef.current.map((t) => (t.id === id ? { ...t, type, statut } : t));
    saveTasks(next);
    if (isTaskDone({ statut })) onTaskDoneRef.current?.(statut, next);
  };

  const addTimeLog = (taskId: string, minutes: number, note: string) => {
    const entry: TimeLog = { id: uid(), minutes, note, date: new Date().toISOString().slice(0, 10) };
    saveTasks(
      tasksRef.current.map((t) =>
        t.id === taskId ? { ...t, timeLogs: [...(t.timeLogs || []), entry] } : t
      )
    );
  };

  const editTimeLog = (taskId: string, logId: string, minutes: number, note: string) => {
    saveTasks(
      tasksRef.current.map((t) =>
        t.id === taskId
          ? {
              ...t,
              timeLogs: (t.timeLogs || []).map((l) => (l.id === logId ? { ...l, minutes, note } : l)),
            }
          : t
      )
    );
  };

  const deleteTimeLog = (taskId: string, logId: string) => {
    saveTasks(
      tasksRef.current.map((t) =>
        t.id === taskId ? { ...t, timeLogs: (t.timeLogs || []).filter((l) => l.id !== logId) } : t
      )
    );
  };

  return {
    loading, tasks, projects, saveError,
    tasksRef, projectsRef,
    saveTasks, saveProjects, saveBoth,
    upsertTask, deleteTask, archiveTask, unarchiveTask, moveTask,
    addTimeLog, editTimeLog, deleteTimeLog,
    canUndo, canRedo, undo, redo,
  };
}
