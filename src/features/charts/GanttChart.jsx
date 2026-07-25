import React, { useMemo } from "react";
import { useLang } from "../../i18n.jsx";
import { STATUSES, statusOf, projectColor } from "../../utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);
const fmtTick = (d, locale) => d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });

// Gantt par projet : uniquement les tâches ayant une échéance, regroupées
// par projet, avec la ligne « aujourd'hui » sur le domaine temporel commun.
export function GanttChart({ tasks, projects, onEditTask }) {
  const { t: tr, locale } = useLang();
  const rows = useMemo(() => {
    const eligible = tasks
      .filter((t) => t.echeance)
      .map((t) => {
        const end = parseDate(t.echeance);
        let start = t.dateDebut ? parseDate(t.dateDebut) : end;
        if (start > end) start = end;
        return { ...t, start, end };
      });

    if (!eligible.length) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let domainStart = new Date(Math.min(...eligible.map((t) => t.start.getTime()), today.getTime()));
    let domainEnd = new Date(Math.max(...eligible.map((t) => t.end.getTime()), today.getTime()));
    domainStart = new Date(domainStart.getTime() - DAY_MS);
    domainEnd = new Date(domainEnd.getTime() + DAY_MS);
    const total = Math.max(domainEnd.getTime() - domainStart.getTime(), DAY_MS);

    const toPct = (d) => ((d.getTime() - domainStart.getTime()) / total) * 100;

    const groups = projects
      .map((p) => ({
        project: p,
        items: eligible
          .filter((t) => t.projet === p)
          .sort((a, b) => a.start - b.start)
          .map((t) => {
            const left = toPct(t.start);
            const width = Math.max(toPct(t.end) - left, 1.2);
            return { ...t, left, width };
          }),
      }))
      .filter((g) => g.items.length);

    const tickCount = 6;
    const ticks = Array.from({ length: tickCount }, (_, i) => {
      const d = new Date(domainStart.getTime() + (total * i) / (tickCount - 1));
      return { label: fmtTick(d, locale), left: toPct(d) };
    });

    const todayLeft = toPct(today);

    return { groups, ticks, todayLeft };
  }, [tasks, projects, locale]);

  if (!rows) {
    return <div className="trk-empty" style={{ padding: 20 }}>{tr("gantt_empty")}</div>;
  }

  return (
    <div className="trk-gantt">
      <div className="trk-gantt-header">
        <div className="trk-gantt-header-spacer" />
        <div className="trk-gantt-header-track">
          {rows.ticks.map((t, i) => (
            <span key={i} className="trk-gantt-tick" style={{ left: `${t.left}%` }}>{t.label}</span>
          ))}
        </div>
      </div>
      <div className="trk-gantt-body">
        {rows.groups.map((g) => (
          <div key={g.project} className="trk-gantt-group">
            <div className="trk-gantt-project-label" style={{ color: projectColor(g.project) }}>{g.project}</div>
            {g.items.map((t) => {
              const st = statusOf(t.statut);
              const handleClick = onEditTask ? () => onEditTask(t) : undefined;
              return (
                <div
                  key={t.id}
                  className={`trk-gantt-row${onEditTask ? " trk-gantt-row-clickable" : ""}`}
                  onClick={handleClick}
                  role={onEditTask ? "button" : undefined}
                  tabIndex={onEditTask ? 0 : undefined}
                  onKeyDown={
                    onEditTask
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleClick();
                          }
                        }
                      : undefined
                  }
                >
                  <div className="trk-gantt-row-label" title={t.titre}>{t.titre}</div>
                  <div className="trk-gantt-track">
                    {rows.todayLeft >= 0 && rows.todayLeft <= 100 && (
                      <div className="trk-gantt-today-line" style={{ left: `${rows.todayLeft}%` }} />
                    )}
                    <div
                      className="trk-gantt-bar"
                      style={{ left: `${t.left}%`, width: `${t.width}%`, background: st.color }}
                      title={`${t.titre} — ${tr(`status_${st.id}`)} (${t.dateDebut || t.echeance} → ${t.echeance})`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="trk-gantt-legend">
        {STATUSES.map((s) => (
          <span key={s.id} className="trk-gantt-legend-item">
            <span className="trk-gantt-legend-dot" style={{ background: s.color }} />
            {tr(`status_${s.id}`)}
          </span>
        ))}
      </div>
    </div>
  );
}
