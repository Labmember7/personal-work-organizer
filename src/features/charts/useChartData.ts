import { useMemo } from "react";
import type { Project, Task } from "../../lib/types";
import { CHART_STATUSES, PRIORITIES, isTaskDone, statusOf } from "../../lib/statuses";
import { taskMinutes } from "../../lib/time";
import { useLang } from "../../i18n/index";

export interface ProjectProgressItem {
  name: string;
  progress: number;
  count: number;
}

export interface ChartData {
  statusDistribution: { name: string; value: number; color: string }[];
  perProjectStacked: Record<string, string | number>[];
  projectTimeDistribution: { projet: string; minutes: number }[];
  priorityDistribution: { name: string; value: number; fill: string }[];
  projectProgress: ProjectProgressItem[];
}

/** Calcul O(T) unique de l'avancement par projet (utilisé par la barre latérale). */
export function computeProjectProgress(tasks: Task[], projects: Project[]): ProjectProgressItem[] {
  const counts = new Map<string, { weightSum: number; count: number }>();
  for (let i = 0; i < tasks.length; i++) {
    const tk = tasks[i]!;
    const key = tk.projet;
    const entry = counts.get(key);
    const weight = statusOf(tk.statut).weight;
    if (entry) {
      entry.weightSum += weight;
      entry.count += 1;
    } else {
      counts.set(key, { weightSum: weight, count: 1 });
    }
  }
  return projects.map((p) => {
    const entry = counts.get(p);
    return {
      name: p,
      progress: entry && entry.count ? Math.round(entry.weightSum / entry.count) : 0,
      count: entry ? entry.count : 0,
    };
  });
}

// Jeux de données des graphiques calculés en une seule passe O(T) (au lieu de
// O(P * S * T)) et montés uniquement lorsque la vue Insights est active.
export function useChartData(tasks: Task[], projects: Project[]): ChartData {
  const { t } = useLang();

  const aggregated = useMemo(() => {
    const statusCounts = new Map<string, number>();
    const prioCounts = new Map<string, number>();
    const projectStatusMap = new Map<string, Map<string, number>>();
    const projectMinutesMap = new Map<string, number>();
    const projectWeightMap = new Map<string, { weightSum: number; count: number }>();

    for (let i = 0; i < projects.length; i++) {
      const p = projects[i]!;
      projectStatusMap.set(p, new Map());
      projectMinutesMap.set(p, 0);
      projectWeightMap.set(p, { weightSum: 0, count: 0 });
    }

    for (let i = 0; i < tasks.length; i++) {
      const tk = tasks[i]!;
      const chartStatusId = isTaskDone(tk) ? "termine" : (tk.statut ?? "");
      const prioId = tk.priorite ?? "";
      statusCounts.set(chartStatusId, (statusCounts.get(chartStatusId) || 0) + 1);
      prioCounts.set(prioId, (prioCounts.get(prioId) || 0) + 1);

      const pStatus = projectStatusMap.get(tk.projet);
      if (pStatus) {
        pStatus.set(chartStatusId, (pStatus.get(chartStatusId) || 0) + 1);
      }
      if (projectMinutesMap.has(tk.projet)) {
        projectMinutesMap.set(tk.projet, projectMinutesMap.get(tk.projet)! + taskMinutes(tk));
      }
      const pWeight = projectWeightMap.get(tk.projet);
      if (pWeight) {
        pWeight.weightSum += statusOf(tk.statut).weight;
        pWeight.count += 1;
      }
    }

    const perProjectStacked = projects.map((p) => {
      const pStatus = projectStatusMap.get(p)!;
      const row: Record<string, string | number> = { projet: p };
      for (let i = 0; i < CHART_STATUSES.length; i++) {
        const sid = CHART_STATUSES[i]!.id;
        row[sid] = pStatus.get(sid) || 0;
      }
      return row;
    });

    const projectTimeDistribution = projects.map((p) => ({
      projet: p,
      minutes: projectMinutesMap.get(p) || 0,
    }));

    const projectProgress = projects.map((p) => {
      const entry = projectWeightMap.get(p)!;
      return {
        name: p,
        progress: entry.count ? Math.round(entry.weightSum / entry.count) : 0,
        count: entry.count,
      };
    });

    return {
      statusCounts,
      prioCounts,
      perProjectStacked,
      projectTimeDistribution,
      projectProgress,
    };
  }, [tasks, projects]);

  const statusDistribution = useMemo(
    () =>
      CHART_STATUSES.map((s) => ({
        name: t(`status_${s.id}`),
        value: aggregated.statusCounts.get(s.id) || 0,
        color: s.color,
      })).filter((d) => d.value > 0),
    [aggregated.statusCounts, t]
  );

  const priorityDistribution = useMemo(
    () =>
      PRIORITIES.map((p) => ({
        name: t(`prio_${p.id}`),
        value: aggregated.prioCounts.get(p.id) || 0,
        fill: p.color,
      })),
    [aggregated.prioCounts, t]
  );

  return useMemo(
    () => ({
      statusDistribution,
      perProjectStacked: aggregated.perProjectStacked,
      projectTimeDistribution: aggregated.projectTimeDistribution,
      priorityDistribution,
      projectProgress: aggregated.projectProgress,
    }),
    [
      statusDistribution,
      aggregated.perProjectStacked,
      aggregated.projectTimeDistribution,
      priorityDistribution,
      aggregated.projectProgress,
    ]
  );
}
