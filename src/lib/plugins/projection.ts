// Projections en lecture seule envoyées aux plugins : tâches, projets, thème.
// Les libellés et couleurs de statut/priorité sont résolus ici via
// `lib/statuses.ts`, pour qu'un plugin n'ait jamais à dupliquer ce référentiel.

import { isTaskDone, prioOf, statusOf } from "../statuses";
import type { Task } from "../types";
import type { HostSnapshot, HostTheme, TaskProjection } from "./types";

export function projectTask(task: Task): TaskProjection {
  const status = statusOf(task.statut);
  const priority = prioOf(task.priorite);
  const minutes = (task.timeLogs ?? []).reduce((sum, log) => sum + (log.minutes || 0), 0);
  return {
    id: task.id,
    titre: task.titre,
    projet: task.projet,
    statut: status.id,
    statutLabel: status.label,
    statutColor: status.color,
    weight: status.weight,
    priorite: priority.id,
    prioriteLabel: priority.label,
    prioriteColor: priority.color,
    assigne: task.assigne ?? "",
    dateDebut: task.dateDebut ?? "",
    echeance: task.echeance ?? "",
    archived: !!task.archived,
    done: isTaskDone(task),
    minutes,
  };
}

export const projectSnapshot = (tasks: Task[], projects: string[]): HostSnapshot => ({
  tasks: tasks.map(projectTask),
  projects: [...projects],
});

// Jetons couleur exposés aux plugins (cf. src/styles/tokens.css). Les jetons
// d'espacement/rayon restent internes à l'app : un plugin dessine son propre
// espacement, il n'a besoin que de la palette pour suivre le thème.
const THEME_TOKEN_NAMES = [
  "--bg",
  "--panel",
  "--panel-alt",
  "--border",
  "--text",
  "--text-dim",
  "--accent",
  "--accent-contrast",
  "--inset",
  "--gauge-track",
  "--overlay",
  "--shadow",
  "--danger",
  "--warn",
  "--ok",
] as const;

// Repli si aucun élément n'est fourni (ex. calcul hors DOM) : valeurs du
// thème sombre par défaut de tokens.css, pour ne jamais envoyer de jeton vide.
const FALLBACK_TOKENS: Record<string, string> = {
  "--bg": "#10141A",
  "--panel": "#181E26",
  "--panel-alt": "#1D2430",
  "--border": "#2A323D",
  "--text": "#E8EBEE",
  "--text-dim": "#8B95A1",
  "--accent": "#35A7A0",
  "--accent-contrast": "#0E1216",
  "--inset": "#0E1216",
  "--gauge-track": "#1F2530",
  "--overlay": "rgba(8, 10, 13, 0.7)",
  "--shadow": "rgba(0, 0, 0, 0.38)",
  "--danger": "#D64545",
  "--warn": "#E08A3C",
  "--ok": "#4CAF6D",
};

/** Lit les jetons calculés sur `el` (typiquement `.trk-app`), repli statique sinon. */
export function themeSnapshot(themeName: string, dark: boolean, el?: HTMLElement | null): HostTheme {
  const computed = el ? getComputedStyle(el) : null;
  const tokens: Record<string, string> = {};
  for (const name of THEME_TOKEN_NAMES) {
    const value = computed?.getPropertyValue(name).trim();
    tokens[name] = value || FALLBACK_TOKENS[name] || "";
  }
  return { name: themeName, dark, tokens };
}
