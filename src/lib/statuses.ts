import type { Priority, Status, Task, TaskDraft } from "./types";

/** Statuts du flux « workflow » (6 étapes), pondérés pour l'avancement. */
export const STATUSES: Status[] = [
  { id: "analyser", label: "À analyser", weight: 0, color: "#8B95A1" },
  { id: "implementer", label: "À implémenter", weight: 20, color: "#4C7EA8" },
  { id: "revue", label: "En revue", weight: 45, color: "#35A7A0" },
  { id: "integrer", label: "À intégrer", weight: 70, color: "#7CA855" },
  { id: "valider", label: "À valider", weight: 90, color: "#D6C13C" },
  { id: "termine", label: "Terminé", weight: 100, color: "#4CAF6D" },
];

// Statuts des tâches "simples" (3 états seulement).
export const SIMPLE_STATUSES: Status[] = [
  { id: "todo", label: "À faire", weight: 0, color: "#8B95A1" },
  { id: "doing", label: "En cours", weight: 50, color: "#4C7EA8" },
  { id: "done", label: "Terminé", weight: 100, color: "#4CAF6D" },
];

export const ALL_STATUSES: Status[] = [...STATUSES, ...SIMPLE_STATUSES];

// Statuts utilisés par les graphiques et le filtre de statut : les deux
// familles fusionnées, avec un seul segment « terminé » (termine + done).
export const CHART_STATUSES: Status[] = [
  ...STATUSES.filter((s) => s.id !== "termine"),
  ...SIMPLE_STATUSES.filter((s) => s.id !== "done"),
  STATUSES.find((s) => s.id === "termine")!,
];

export const PRIORITIES: Priority[] = [
  { id: "critique", label: "Critique", color: "#D64545", order: 0 },
  { id: "haute", label: "Haute", color: "#E08A3C", order: 1 },
  { id: "moyenne", label: "Moyenne", color: "#D6C13C", order: 2 },
  { id: "basse", label: "Basse", color: "#4CAF6D", order: 3 },
];

/** Vrai si la tâche suit le flux « simple » (3 états). */
export const isSimpleTask = (t: Pick<Task | TaskDraft, "type">): boolean => t.type === "simple";

export const statusesForTask = (t: Pick<Task | TaskDraft, "type">): Status[] =>
  isSimpleTask(t) ? SIMPLE_STATUSES : STATUSES;

/** Vrai pour les deux statuts terminaux (termine / done). */
export const isDoneStatus = (id: string | undefined): boolean => id === "termine" || id === "done";

/** Vrai si la tâche est terminée, quel que soit son flux. */
export const isTaskDone = (t: Pick<Task, "statut">): boolean => isDoneStatus(t.statut);

/** Statut par id ; repli sur le premier statut workflow si inconnu. */
export const statusOf = (id: string | undefined): Status =>
  ALL_STATUSES.find((s) => s.id === id) || STATUSES[0]!;

/** Priorité par id ; repli sur « moyenne » si inconnue. */
export const prioOf = (id: string | undefined): Priority =>
  PRIORITIES.find((p) => p.id === id) || PRIORITIES[2]!;
