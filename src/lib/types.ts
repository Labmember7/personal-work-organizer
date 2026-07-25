// Modèle de données de l'app. Les champs optionnels reflètent les données
// historiques : d'anciennes sauvegardes peuvent ne pas les porter, et
// normalizeBackupData (lib/backup.ts) les complète à l'import.

/** Statuts « workflow » (6 étapes) puis statuts « simples » (3 étapes). */
export type WorkflowStatusId = "analyser" | "implementer" | "revue" | "integrer" | "valider" | "termine";
export type SimpleStatusId = "todo" | "doing" | "done";
export type StatusId = WorkflowStatusId | SimpleStatusId;

export type PriorityId = "critique" | "haute" | "moyenne" | "basse";

export type TaskType = "standard" | "simple";

export interface Status {
  id: StatusId;
  label: string;
  weight: number;
  color: string;
}

export interface Priority {
  id: PriorityId;
  label: string;
  color: string;
  order: number;
}

export interface TimeLog {
  id: string;
  minutes: number;
  note: string;
  date: string; // AAAA-MM-JJ
}

export interface Task {
  id: string;
  type?: TaskType; // absent sur d'anciennes données = "standard"
  titre: string;
  projet: string;
  description?: string;
  priorite?: string;
  statut?: string;
  assigne?: string;
  dateDebut?: string; // AAAA-MM-JJ
  echeance?: string; // AAAA-MM-JJ
  timeLogs?: TimeLog[];
  archived?: boolean;
}

/** Brouillon du modal : id null tant que la tâche n'est pas créée. */
export type TaskDraft = Omit<Task, "id"> & { id: string | null };

export type Project = string;

/** Charge utile des fichiers d'export/import (sauvegardes). */
export interface BackupPayload {
  tasks: Task[];
  projects: Project[];
  exportedAt?: string;
  /** Version du format, présente depuis la v1.4 ; absente = format initial. */
  version?: number;
}
