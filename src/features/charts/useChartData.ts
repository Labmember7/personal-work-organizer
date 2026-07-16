import { useMemo } from "react";
import type { Project, Task } from "../../lib/types";
import { CHART_STATUSES, PRIORITIES, isTaskDone, statusOf } from "../../lib/statuses";
import { taskMinutes } from "../../lib/time";
import { useLang } from "../../i18n/index";

export interface ChartData {
  statusDistribution: { name: string; value: number; color: string }[];
  perProjectStacked: Record<string, string | number>[];
  projectTimeDistribution: { projet: string; minutes: number }[];
  priorityDistribution: { name: string; value: number; fill: string }[];
  projectProgress: { name: string; progress: number; count: number }[];
}

// Jeux de données des graphiques, mémoïsés. Les libellés dépendent de la
// langue courante : les memos se recalculent au changement de langue.
export function useChartData(tasks: Task[], projects: Project[]): ChartData {
  const { t, lang } = useLang();

  const statusDistribution = useMemo(
    () =>
      CHART_STATUSES.map((s) => ({
        name: t(`status_${s.id}`),
        value: tasks.filter((tk) => (s.id === "termine" ? isTaskDone(tk) : tk.statut === s.id)).length,
        color: s.color,
      })).filter((d) => d.value > 0),
    [tasks, lang]
  );

  const perProjectStacked = useMemo(() => {
    return projects.map((p) => {
      const pt = tasks.filter((tk) => tk.projet === p);
      const row: Record<string, string | number> = { projet: p };
      CHART_STATUSES.forEach((s) => {
        row[s.id] = pt.filter((tk) => (s.id === "termine" ? isTaskDone(tk) : tk.statut === s.id)).length;
      });
      return row;
    });
  }, [projects, tasks]);

  const projectTimeDistribution = useMemo(
    () =>
      projects.map((p) => ({
        projet: p,
        minutes: tasks.filter((tk) => tk.projet === p).reduce((sum, tk) => sum + taskMinutes(tk), 0),
      })),
    [projects, tasks]
  );

  const priorityDistribution = useMemo(
    () =>
      PRIORITIES.map((p) => ({
        name: t(`prio_${p.id}`),
        value: tasks.filter((tk) => tk.priorite === p.id).length,
        fill: p.color,
      })),
    [tasks, lang]
  );

  const projectProgress = useMemo(() => {
    return projects.map((p) => {
      const pt = tasks.filter((tk) => tk.projet === p);
      const avg = pt.length ? Math.round(pt.reduce((a, tk) => a + statusOf(tk.statut).weight, 0) / pt.length) : 0;
      return { name: p, progress: avg, count: pt.length };
    });
  }, [projects, tasks]);

  return { statusDistribution, perProjectStacked, projectTimeDistribution, priorityDistribution, projectProgress };
}
