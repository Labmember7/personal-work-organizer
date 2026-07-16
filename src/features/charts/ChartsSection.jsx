import React from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import { useLang } from "../../i18n.jsx";
import { CHART_STATUSES, isTaskDone, formatDuration, projectColor } from "../../utils";
import { ChartCard } from "../../components/ChartCard.jsx";
import { GanttChart } from "./GanttChart.jsx";

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

const tooltipStyle = {
  contentStyle: { background: "var(--panel)", border: "1px solid var(--border)", fontSize: 12 },
  labelStyle: { color: "var(--text)" },
  itemStyle: { color: "var(--text)" },
};

// Les quatre graphiques de synthèse + le Gantt, chacun dans une ChartCard
// (agrandissable en modal avec tableau de détails).
export function ChartsSection({ tasks, projects, chartData }) {
  const { t } = useLang();
  const {
    statusDistribution, perProjectStacked, projectTimeDistribution,
    priorityDistribution, projectProgress,
  } = chartData;

  return (
    <>
      <section className="trk-charts">
        <ChartCard
          title={t("chart_status_distribution")}
          tip="chart_status"
          empty={statusDistribution.length === 0}
          emptyLabel={t("no_data")}
          details={{
            headers: [t("field_status"), t("detail_count"), t("detail_share")],
            rows: [
              ...statusDistribution.map((d) => [d.name, d.value, pct(d.value, tasks.length)]),
              [t("detail_total"), tasks.length, "100%"],
            ],
          }}
          render={(height, focused) => (
            <ResponsiveContainer width="100%" height={height}>
              <PieChart>
                <Pie
                  data={statusDistribution} dataKey="value" nameKey="name"
                  innerRadius={focused ? 85 : 45} outerRadius={focused ? 135 : 70}
                  paddingAngle={2} label={focused}
                >
                  {statusDistribution.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        />

        <ChartCard
          title={t("chart_project_progress")}
          tip="chart_projects"
          empty={tasks.length === 0}
          emptyLabel={t("no_data")}
          details={{
            headers: [t("field_project"), t("detail_count"), t("status_termine"), t("detail_progress")],
            rows: projectProgress.map((p) => [
              p.name,
              p.count,
              tasks.filter((tk) => tk.projet === p.name && isTaskDone(tk)).length,
              `${p.progress}%`,
            ]),
          }}
          render={(height, focused) => (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={perProjectStacked} layout="vertical" margin={{ left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
                <YAxis type="category" dataKey="projet" tick={{ fill: "var(--text)", fontSize: 11 }} width={focused ? 110 : 70} />
                <Tooltip contentStyle={tooltipStyle.contentStyle} labelStyle={tooltipStyle.labelStyle} />
                {focused && <Legend wrapperStyle={{ fontSize: 11 }} />}
                {CHART_STATUSES.map((s) => (
                  <Bar key={s.id} dataKey={s.id} name={t(`status_${s.id}`)} stackId="a" fill={s.color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        />

        <ChartCard
          title={t("chart_priority_distribution")}
          tip="chart_priority"
          empty={tasks.length === 0}
          emptyLabel={t("no_data")}
          details={{
            headers: [t("field_priority"), t("detail_count"), t("detail_share")],
            rows: priorityDistribution.map((d) => [d.name, d.value, pct(d.value, tasks.length)]),
          }}
          render={(height) => (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={priorityDistribution} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--text-dim)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--text-dim)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {priorityDistribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        />

        <ChartCard
          title={t("chart_time_per_project")}
          tip="chart_time"
          empty={projectTimeDistribution.every((d) => d.minutes === 0)}
          emptyLabel={t("no_time_logged")}
          details={{
            headers: [t("field_project"), t("time_tooltip"), t("detail_share")],
            rows: (() => {
              const total = projectTimeDistribution.reduce((s, d) => s + d.minutes, 0);
              return [
                ...projectTimeDistribution
                  .filter((d) => d.minutes > 0)
                  .map((d) => [d.projet, formatDuration(d.minutes), pct(d.minutes, total)]),
                [t("detail_total"), formatDuration(total), "100%"],
              ];
            })(),
          }}
          render={(height, focused) => (
            <ResponsiveContainer width="100%" height={height}>
              <BarChart data={projectTimeDistribution} layout="vertical" margin={{ left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "var(--text-dim)", fontSize: 11 }}
                  tickFormatter={formatDuration}
                  allowDecimals={false}
                />
                <YAxis type="category" dataKey="projet" tick={{ fill: "var(--text)", fontSize: 11 }} width={focused ? 110 : 70} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(value) => [formatDuration(value), t("time_tooltip")]}
                />
                <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                  {projectTimeDistribution.map((d, i) => (
                    <Cell key={i} fill={projectColor(d.projet)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        />
      </section>

      <ChartCard
        className="trk-gantt-card"
        title={t("chart_gantt")}
        tip="chart_gantt"
        empty={!tasks.some((tk) => tk.echeance)}
        emptyLabel={t("gantt_empty")}
        render={(height, focused) => (
          <div className={focused ? "trk-gantt-focus" : undefined}>
            <GanttChart tasks={tasks} projects={projects} />
          </div>
        )}
      />
    </>
  );
}
