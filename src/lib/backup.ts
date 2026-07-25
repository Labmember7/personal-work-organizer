import type { BackupPayload, Project, Task, TimeLog } from "./types";
import { PRIORITIES, SIMPLE_STATUSES, STATUSES } from "./statuses";
import { uid } from "./uid";

// Version courante du format de sauvegarde. Incrémentée à chaque changement
// de structure ; migrateBackup adapte les anciens formats à la lecture.
export const BACKUP_FORMAT_VERSION = 1;

// Une tâche importée doit au minimum porter un titre et un projet : le reste
// est normalisé, mais ces deux champs sont utilisés partout (recherche, tri,
// graphiques) et leur absence ferait planter l'app après coup.
const isValidTaskShape = (t: unknown): boolean =>
  !!t && typeof t === "object" &&
  typeof (t as Task).titre === "string" &&
  typeof (t as Task).projet === "string" && (t as Task).projet.trim() !== "";

export const isValidBackupData = (data: unknown): data is BackupPayload =>
  !!data && typeof data === "object" &&
  Array.isArray((data as BackupPayload).tasks) &&
  Array.isArray((data as BackupPayload).projects) &&
  (data as BackupPayload).tasks.every(isValidTaskShape) &&
  (data as BackupPayload).projects.every((p) => typeof p === "string");

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const normalizeTimeLog = (l: unknown): TimeLog | null => {
  const log = l as TimeLog | null;
  return !!log && typeof log === "object" && typeof log.minutes === "number" && log.minutes > 0
    ? {
        id: log.id != null ? String(log.id) : uid(),
        minutes: Math.round(log.minutes),
        note: asString(log.note),
        date: asString(log.date) || new Date().toISOString().slice(0, 10),
      }
    : null;
};

const normalizeTask = (t: Task): Task => {
  const type = t.type === "simple" ? "simple" : "standard";
  const statuses = type === "simple" ? SIMPLE_STATUSES : STATUSES;
  return {
    id: t.id != null ? String(t.id) : uid(),
    type,
    titre: t.titre,
    projet: t.projet,
    description: asString(t.description),
    priorite: PRIORITIES.some((p) => p.id === t.priorite) ? t.priorite : "moyenne",
    statut: statuses.some((s) => s.id === t.statut) ? t.statut : statuses[0]!.id,
    assigne: asString(t.assigne),
    dateDebut: asString(t.dateDebut),
    echeance: asString(t.echeance),
    timeLogs: (Array.isArray(t.timeLogs) ? t.timeLogs : []).map(normalizeTimeLog).filter((l): l is TimeLog => l !== null),
    archived: t.archived === true,
  };
};

// Prépare des données importées (déjà validées par isValidBackupData) :
// migration de version éventuelle, champs manquants normalisés, et liste de
// projets réconciliée avec ceux référencés par les tâches (une tâche
// orpheline serait invisible dans la barre latérale, les graphiques et le
// Gantt).
export const normalizeBackupData = (data: BackupPayload): { tasks: Task[]; projects: Project[] } => {
  const migrated = migrateBackup(data);
  const tasks = migrated.tasks.map(normalizeTask);
  const projects = [...new Set([
    ...migrated.projects.map((p) => p.trim()).filter(Boolean),
    ...tasks.map((t) => t.projet),
  ])];
  return { tasks, projects };
};

// Adapte une sauvegarde d'une version antérieure au format courant.
// Version absente = format initial (identique au format 1 hors métadonnée).
export const migrateBackup = (data: BackupPayload): BackupPayload => {
  const version = data.version ?? 0;
  if (version >= BACKUP_FORMAT_VERSION) return data;
  // v0 -> v1 : aucune transformation structurelle, seulement la métadonnée.
  return { ...data, version: BACKUP_FORMAT_VERSION };
};

export const buildBackupPayload = (tasks: Task[], projects: Project[]): BackupPayload => ({
  tasks,
  projects,
  exportedAt: new Date().toISOString(),
  version: BACKUP_FORMAT_VERSION,
});
