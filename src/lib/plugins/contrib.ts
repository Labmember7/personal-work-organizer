// Points de contribution exploité par l'hôte : colonnes de la liste de tâches
// (taskColumns). Les autres points (commands, taskPanels, settings) sont remontés
// sur PluginManifest mais leur rendu UI est géré ailleurs. Cf. PLUGIN_FORMAT_V2.md § 4.

import type { Task } from "../types";
import { parse, evaluate } from "./trkx";
import type { EvalContext } from "./expr";
import { projectTask } from "./projection";
import type { PluginSource, TaskColumnContrib, TaskPanelContrib } from "./types";

// Récolte les colonnes contribuées par tous les plugins (v2) ayant un champ
// `contributes.taskColumns` valide.
export function collectTaskColumns(plugins: PluginSource[]): TaskColumnContrib[] {
  const cols: TaskColumnContrib[] = [];
  for (const p of plugins) {
    const c = p.manifest?.taskColumns;
    if (Array.isArray(c)) cols.push(...c);
  }
  return cols;
}

function formatColValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" && "label" in x ? String((x as { label: unknown }).label) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Évalue la valeur d'une colonne contribuée pour une tâche donnée. Contexte :
// projection en lecture seule (`task`), `refs` (liens éventuels de la tâche),
// `now`, `lang`, `settings` — cf. PLUGIN_FORMAT_V2.md § 4 (taskColumns).
export function evalColumnValue(col: TaskColumnContrib, task: Task, lang: string): string {
  const src = typeof col.value === "string" ? col.value : "";
  if (!src) return "";
  const ast = parse(src);
  if (!ast) return "";
  try {
    const ctx = {
      task: projectTask(task),
      refs: (task as { refs?: unknown[] }).refs ?? [],
      now: Date.now(),
      lang,
      settings: {},
    } as unknown as EvalContext;
    const v = evaluate(ast, ctx);
    return formatColValue(v);
  } catch {
    return "";
  }
}

// Panneau de tâche contribué : une entrée résolue prête à être rendue
// (spec déclarative embarquée ou iframe `app`).
export interface TaskPanelInstance {
  pluginId: string;
  panel: TaskPanelContrib;
  /** JSON brut de la spec `trk.view/1` (kind "declarative"). */
  specJson?: string;
}

export function collectTaskPanels(plugins: PluginSource[]): TaskPanelInstance[] {
  const out: TaskPanelInstance[] = [];
  for (const p of plugins) {
    const panels = p.manifest?.taskPanels;
    if (!Array.isArray(panels)) continue;
    for (const panel of panels) {
      out.push({
        pluginId: p.manifest.id,
        panel,
        specJson: panel.kind === "declarative" ? p.panelSpecs?.[panel.id] : undefined,
      });
    }
  }
  return out;
}
