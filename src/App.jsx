import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import {
  Plus, X, Check, Trash2, Pencil, Search, ArrowUpDown,
  ChevronDown, FolderPlus, AlertTriangle, Minus, Copy, ChevronsUpDown, Clock,
  Download, Upload, List, Columns3, ChevronLeft, ChevronRight, Maximize2,
  Sun, Moon, ClipboardList, PartyPopper, Flame, Target, Zap, ArrowRight, HelpCircle,
  Pilcrow, Eye, Columns2,
} from "lucide-react";
import {
  STATUSES, SIMPLE_STATUSES, PRIORITIES, uid, statusOf, prioOf,
  isSimpleTask, statusesForTask, isDoneStatus, isTaskDone, focusMinutes,
  taskMinutes, liveTaskMinutes, formatDuration, parseDurationInput, projectColor,
  isValidBackupData, buildBackupPayload, taskMatchesQuery, matchesQuery, renderMarkdown,
} from "./utils";
import {
  useLang, doneOfTotal, tasksTotalLabel, allProjectsLabel,
  selectedCountLabel, statusCountLabel, pageOfLabel,
} from "./i18n.jsx";
import { CelebrationOverlay, MiniCelebration, pickCelebration } from "./celebration.jsx";

const DEFAULT_PROJECTS = [];
const STORAGE_KEY = "suivi-travaux-data";
const THEME_STORAGE_KEY = "suivi-travaux-theme";
const CELEBRATIONS_STORAGE_KEY = "suivi-travaux-celebrations";
const FOCUS_STORAGE_KEY = "suivi-travaux-focus";
const FOCUS_STARTED_STORAGE_KEY = "suivi-travaux-focus-started";
const FOCUS_REDUCED_STORAGE_KEY = "suivi-travaux-focus-reduced";
// Type MIME custom marquant un drag initié depuis la carte de la zone de focus.
const FOCUS_DRAG_TYPE = "application/x-trk-focus";

// Image 1x1 transparente : masque le fantôme natif du drag, remplacé par
// la pilule « verre liquide » custom qui suit le curseur.
let emptyDragImage = null;
const getEmptyDragImage = () => {
  if (!emptyDragImage) {
    emptyDragImage = new Image();
    emptyDragImage.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  }
  return emptyDragImage;
};

// Statuts utilisés par les graphiques : les deux familles fusionnées,
// avec un seul segment « terminé » (termine + done).
const CHART_STATUSES = [
  ...STATUSES.filter((s) => s.id !== "termine"),
  ...SIMPLE_STATUSES.filter((s) => s.id !== "done"),
  STATUSES.find((s) => s.id === "termine"),
];

function Gauge({ value }) {
  const { t } = useLang();
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  const dash = C * (pct / 100);
  const color = pct < 35 ? "var(--danger)" : pct < 70 ? "var(--warn)" : "var(--ok)";
  const ticks = Array.from({ length: 24 });
  return (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <g>
        {ticks.map((_, i) => {
          const angle = (i * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const x1 = 60 + 58 * Math.cos(rad);
          const y1 = 60 + 58 * Math.sin(rad);
          const x2 = 60 + 52 * Math.cos(rad);
          const y2 = 60 + 52 * Math.sin(rad);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--border)" strokeWidth="1.5" />
          );
        })}
      </g>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--gauge-track)" strokeWidth="9" />
      <circle
        cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.5s ease" }}
      />
      <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)"
        fontFamily="'Space Grotesk', sans-serif">
        {Math.round(pct)}%
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="8" fill="var(--text-dim)"
        fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
        {t("gauge_caption")}
      </text>
    </svg>
  );
}

function ProgressBar({ value, height = 6 }) {
  const color = value < 35 ? "var(--danger)" : value < 70 ? "var(--warn)" : "var(--ok)";
  return (
    <div className="trk-pbar" style={{ height }}>
      <div className="trk-pbar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className="trk-lang-switch">
      {["fr", "en"].map((l) => (
        <button
          key={l}
          type="button"
          className={"trk-lang-btn" + (lang === l ? " active" : "")}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function TitleBar({ maximized }) {
  const { t } = useLang();
  const hasControls = typeof window !== "undefined" && !!window.windowControls;

  if (!hasControls) return null;

  return (
    <div className="trk-titlebar">
      <div className="trk-titlebar-drag">
        <span className="trk-titlebar-title">{t("titlebar_title")}</span>
      </div>
      <div className="trk-traffic-lights">
        <button
          className="trk-traffic-btn trk-traffic-minimize"
          onClick={() => window.windowControls.minimize()}
          title={t("minimize")}
        >
          <Minus size={8} strokeWidth={3} className="trk-traffic-glyph" />
        </button>
        <button
          className="trk-traffic-btn trk-traffic-maximize"
          onClick={() => window.windowControls.toggleMaximize()}
          title={maximized ? t("restore") : t("maximize")}
        >
          {maximized ? (
            <Copy size={7} strokeWidth={3} className="trk-traffic-glyph" />
          ) : (
            <ChevronsUpDown size={8} strokeWidth={3} className="trk-traffic-glyph" />
          )}
        </button>
        <button
          className="trk-traffic-btn trk-traffic-close"
          onClick={() => window.windowControls.close()}
          title={t("close")}
        >
          <X size={8} strokeWidth={3} className="trk-traffic-glyph" />
        </button>
      </div>
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);
const fmtTick = (d, locale) => d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });

function GanttChart({ tasks, projects }) {
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
              return (
                <div key={t.id} className="trk-gantt-row">
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

function StatusFilterDropdown({ selected, onToggle, onClear }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = statusCountLabel(t, lang, selected.length);

  return (
    <div className="trk-multiselect" ref={ref}>
      <button
        type="button"
        className={"trk-select trk-multiselect-btn" + (selected.length ? " active" : "")}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="trk-multiselect-panel">
          {CHART_STATUSES.map((s) => (
            <label key={s.id} className="trk-multiselect-item">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => onToggle(s.id)} />
              <span className="trk-multiselect-dot" style={{ background: s.color }} />
              {t(`status_${s.id}`)}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="trk-multiselect-clear" onClick={onClear}>{t("clear_selection")}</button>
          )}
        </div>
      )}
    </div>
  );
}

// Ligne d'historique éditable : bascule entre affichage et formulaire
// d'édition (durée + note), partagée par le popover et la section inline.
function TimeLogEntryRow({ log, onEdit, onDelete }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const startEdit = () => {
    setDuration(formatDuration(log.minutes));
    setNote(log.note || "");
    setError(false);
    setEditing(true);
  };

  const save = () => {
    const minutes = parseDurationInput(duration);
    if (!minutes) {
      setError(true);
      return;
    }
    onEdit(log.id, minutes, note.trim());
    setEditing(false);
  };

  const onEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="trk-timelog-entry trk-timelog-entry-edit">
        <input
          className="trk-timelog-duration-input"
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          onKeyDown={onEnter}
          autoFocus
        />
        <input
          className="trk-timelog-note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onEnter}
        />
        <button type="button" className="trk-icon-btn" onClick={save} title={t("save")}>
          <Check size={12} />
        </button>
        <button type="button" className="trk-icon-btn" onClick={() => setEditing(false)} title={t("cancel")}>
          <X size={12} />
        </button>
        {error && <div className="trk-timelog-error">{t("duration_format_error")}</div>}
      </div>
    );
  }

  return (
    <div className="trk-timelog-entry">
      <span className="trk-timelog-entry-info">
        <strong>{formatDuration(log.minutes)}</strong> · {log.date}{log.note ? ` · ${log.note}` : ""}
      </span>
      <button type="button" className="trk-icon-btn" onClick={startEdit} title={t("edit_entry")}>
        <Pencil size={12} />
      </button>
      <button type="button" className="trk-icon-btn" onClick={() => onDelete(log.id)} title={t("remove")}>
        <X size={12} />
      </button>
    </div>
  );
}

function TimeLogPopover({ task, liveMinutes, onAdd, onEdit, onDelete, onClose }) {
  const { t } = useLang();
  const ref = useRef(null);
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const logs = task.timeLogs || [];
  const total = liveMinutes ?? taskMinutes(task);

  const submit = (e) => {
    e.preventDefault();
    const minutes = parseDurationInput(duration);
    if (!minutes) {
      setError(true);
      return;
    }
    onAdd(minutes, note.trim());
    setDuration("");
    setNote("");
    setError(false);
  };

  return (
    <div className="trk-timelog-panel" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div className="trk-timelog-total">
        <span>{t("time_spent")}</span>
        <span>{formatDuration(total)}</span>
      </div>
      <form className="trk-timelog-add" onSubmit={submit}>
        <input
          className="trk-timelog-duration-input"
          placeholder={t("duration_placeholder")}
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          autoFocus
        />
        <input
          className="trk-timelog-note-input"
          placeholder={t("note_placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="trk-icon-btn" title={t("add")}>
          <Plus size={14} />
        </button>
      </form>
      {error && <div className="trk-timelog-error">{t("duration_format_error")}</div>}
      <div className="trk-timelog-list">
        {logs.length === 0 && <div className="trk-timelog-empty">{t("no_entry")}</div>}
        {[...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
          <TimeLogEntryRow key={l.id} log={l} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

function TimeLogSection({ task, liveMinutes, onAdd, onEdit, onDelete }) {
  const { t } = useLang();
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const logs = task.timeLogs || [];
  const total = liveMinutes ?? taskMinutes(task);

  const submit = () => {
    const minutes = parseDurationInput(duration);
    if (!minutes) {
      setError(true);
      return;
    }
    onAdd(minutes, note.trim());
    setDuration("");
    setNote("");
    setError(false);
  };

  const onEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="trk-timelog-inline">
      <div className="trk-timelog-total">
        <span>{t("time_logged")}</span>
        <span>{formatDuration(total)}</span>
      </div>
      <div className="trk-timelog-add">
        <input
          className="trk-timelog-duration-input"
          placeholder={t("duration_placeholder")}
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          onKeyDown={onEnter}
        />
        <input
          className="trk-timelog-note-input"
          placeholder={t("note_placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onEnter}
        />
        <button type="button" className="trk-icon-btn" title={t("add")} onClick={submit}>
          <Plus size={14} />
        </button>
      </div>
      {error && <div className="trk-timelog-error">{t("duration_format_error")}</div>}
      <div className="trk-timelog-list">
        {logs.length === 0 && <div className="trk-timelog-empty">{t("no_entry")}</div>}
        {[...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
          <TimeLogEntryRow key={l.id} log={l} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}

const PAGE_SIZE = 6;
const KANBAN_PAGE_SIZE = 3;
const PROJECT_PAGE_SIZE = 6;

// Pagination réutilisable : découpe items, borne la page courante et
// revient en page 1 quand resetKey change (filtres, recherche, tri…).
function usePagination(items, pageSize, resetKey) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );
  return { page: currentPage, setPage, totalPages, pageItems };
}

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

function Pagination({ page, totalPages, onChange, compact = false }) {
  const { t, lang } = useLang();
  if (compact) {
    return (
      <div className="trk-pagination trk-pagination-compact">
        <button
          type="button"
          className="trk-page-btn trk-page-nav"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          title={t("page_prev")}
        >
          <ChevronLeft size={13} />
        </button>
        <span className="trk-page-info">{page}/{totalPages}</span>
        <button
          type="button"
          className="trk-page-btn trk-page-nav"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          title={t("page_next")}
        >
          <ChevronRight size={13} />
        </button>
      </div>
    );
  }
  if (totalPages <= 1) return null;
  return (
    <div className="trk-pagination">
      <button
        type="button"
        className="trk-page-btn trk-page-nav"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        title={t("page_prev")}
      >
        <ChevronLeft size={15} />
      </button>
      {pageNumbers(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="trk-page-ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={"trk-page-btn" + (p === page ? " active" : "")}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className="trk-page-btn trk-page-nav"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        title={t("page_next")}
      >
        <ChevronRight size={15} />
      </button>
      <span className="trk-page-info">{pageOfLabel(lang, page, totalPages)}</span>
    </div>
  );
}

function KanbanCard({ task, dragging, onDragStart, onDragEnd, onEdit, onDelete, confirmId, onAskDelete, onCancelDelete, liveMinutesFor }) {
  const { t } = useLang();
  const pr = prioOf(task.priorite);
  const pc = projectColor(task.projet);
  const minutes = liveMinutesFor ? liveMinutesFor(task) : taskMinutes(task);
  return (
    <div
      className={"trk-kanban-card" + (dragging ? " dragging" : "") + (isTaskDone(task) ? " done" : "")}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ "--rail-color": pr.color }}
    >
      <p className="trk-kanban-card-title" title={task.titre}>{task.titre}</p>
      <div className="trk-kanban-card-meta">
        <span className="trk-tag" style={{ "--pill-color": pc }}>
          {task.projet}
        </span>
        {isSimpleTask(task) && (
          <span className="trk-type-tag"><Zap size={10} /> {t("type_simple_tag")}</span>
        )}
        <span className="trk-prio-tag" style={{ "--pill-color": pr.color }}>
          {task.priorite === "critique" && <AlertTriangle size={10} />}
          {t(`prio_${pr.id}`)}
        </span>
      </div>
      <div className="trk-kanban-card-footer">
        <span className="trk-kanban-card-info">
          {task.echeance && <span className="trk-mono">{task.echeance}</span>}
          {minutes > 0 && (
            <span className="trk-mono trk-kanban-time">
              <Clock size={10} /> {formatDuration(minutes)}
            </span>
          )}
        </span>
        <span className="trk-kanban-card-actions">
          {confirmId === task.id ? (
            <>
              <span className="trk-confirm-label">{t("delete_confirm")}</span>
              <button className="trk-icon-btn trk-icon-danger" onClick={() => onDelete(task.id)} title={t("confirm_delete_yes")} aria-label={t("confirm_delete_yes")}><Check size={12} /></button>
              <button className="trk-icon-btn" onClick={onCancelDelete} title={t("cancel")} aria-label={t("cancel")}><X size={12} /></button>
            </>
          ) : (
            <>
              <button className="trk-icon-btn" onClick={() => onEdit(task)} title={t("edit_task")}>
                <Pencil size={12} />
              </button>
              <button className="trk-icon-btn" onClick={() => onAskDelete(task.id)} title={t("remove")}>
                <Trash2 size={12} />
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({ status, tasks, dragCtx, cardProps }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [prio, setPrio] = useState("");
  const { dragId, setDragId, overCol, setOverCol, onMove, endDrag } = dragCtx;

  const visible = useMemo(
    () => tasks.filter((tk) => (!prio || tk.priorite === prio) && taskMatchesQuery(tk, query)),
    [tasks, query, prio]
  );
  const { page, setPage, totalPages, pageItems } = usePagination(
    visible, KANBAN_PAGE_SIZE, `${query}|${prio}`
  );

  return (
    <div
      className={"trk-kanban-col" + (overCol === status.id ? " drag-over" : "")}
      style={{ "--col-color": status.color }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overCol !== status.id) setOverCol(status.id);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || dragId;
        if (id) onMove(id, status.id);
        endDrag();
      }}
    >
      <div className="trk-kanban-col-header">
        <span className="trk-kanban-col-dot" style={{ background: status.color }} />
        <span className="trk-kanban-col-title">{t(`status_${status.id}`)}</span>
        <span className="trk-kanban-col-count">
          {visible.length === tasks.length ? tasks.length : `${visible.length}/${tasks.length}`}
        </span>
      </div>
      <div className="trk-kanban-col-tools">
        <div className="trk-kanban-col-search">
          <Search size={11} color="var(--text-dim)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("col_search_placeholder")}
          />
          {query && (
            <button type="button" className="trk-icon-btn" onClick={() => setQuery("")} title={t("clear_selection")}>
              <X size={11} />
            </button>
          )}
        </div>
        <select
          className={"trk-kanban-col-prio" + (prio ? " active" : "")}
          value={prio}
          onChange={(e) => setPrio(e.target.value)}
        >
          <option value="">{t("prio_all")}</option>
          {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{t(`prio_${p.id}`)}</option>)}
        </select>
      </div>
      <div className="trk-kanban-col-body">
        {pageItems.length === 0 && (
          <div className="trk-kanban-drop-hint">{t("kanban_empty_col")}</div>
        )}
        {pageItems.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            dragging={dragId === task.id}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", task.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(task.id);
            }}
            onDragEnd={endDrag}
            {...cardProps}
          />
        ))}
      </div>
      <div className="trk-kanban-col-footer">
        <Pagination compact page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}

function KanbanBoard({ tasks, statuses = STATUSES, onMove, onEdit, onDelete, confirmId, onAskDelete, onCancelDelete, liveMinutesFor }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const endDrag = () => {
    setDragId(null);
    setOverCol(null);
  };

  const dragCtx = { dragId, setDragId, overCol, setOverCol, onMove, endDrag };
  const cardProps = { onEdit, onDelete, confirmId, onAskDelete, onCancelDelete, liveMinutesFor };

  return (
    <div className="trk-kanban">
      {statuses.map((s) => (
        <KanbanColumn
          key={s.id}
          status={s}
          tasks={tasks.filter((tk) => tk.statut === s.id)}
          dragCtx={dragCtx}
          cardProps={cardProps}
        />
      ))}
    </div>
  );
}


// Carte de graphique réutilisable : bouton focus -> modal agrandi
// avec le même graphique en grand et un tableau de détails.
function ChartCard({ title, empty, emptyLabel, render, details, className = "" }) {
  const { t } = useLang();
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) return;
    const handler = (e) => e.key === "Escape" && setFocused(false);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focused]);

  return (
    <div className={"trk-chart-card " + className}>
      <div className="trk-chart-head">
        <div className="trk-chart-title">{title}</div>
        {!empty && (
          <button
            type="button"
            className="trk-icon-btn trk-chart-focus-btn"
            onClick={() => setFocused(true)}
            title={t("focus_chart")}
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>
      {empty ? (
        <div className="trk-empty" style={{ padding: 20 }}>{emptyLabel}</div>
      ) : (
        render(200, false)
      )}
      {focused && (
        <div className="trk-modal-overlay" onClick={() => setFocused(false)}>
          <div className="trk-modal trk-chart-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
            <div className="trk-modal-header">
              <span className="trk-modal-title">{title}</span>
              <button className="trk-icon-btn" onClick={() => setFocused(false)}><X size={16} /></button>
            </div>
            <div className="trk-chart-modal-body">
              {render(460, true)}
              {details && (
                <table className="trk-chart-details">
                  <thead>
                    <tr>{details.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {details.rows.map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "0%");

// Zone de focus : dock flottant qui accueille UNE tâche en cours (drag & drop).
// La tâche « cuit » (animations + pointage du temps) et sort automatiquement
// une fois terminée. Réductible en pastille compacte.
function FocusZone({ task, leaving, enterKey, startedAt, onDropTask, onAdvance, onRelease, onEdit }) {
  const { t } = useLang();
  const [over, setOver] = useState(false);
  const [dragOut, setDragOut] = useState(false);
  const [dragHome, setDragHome] = useState(true);
  const [ghostPop, setGhostPop] = useState(false);
  const zoneRef = useRef(null);
  const ghostRef = useRef(null);
  const deformRef = useRef(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const dragTitleRef = useRef("");
  const popTimerRef = useRef(null);

  useEffect(() => () => clearTimeout(popTimerRef.current), []);

  // Pilote la goutte fantôme pendant le drag : elle court après le curseur
  // avec inertie (ressort) et s'étire dans le sens du déplacement, comme une
  // goutte d'eau. Uniquement des transforms via rAF, aucun re-render par frame.
  useEffect(() => {
    if (!dragOut) return;
    const onDragOver = (e) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener("dragover", onDragOver);
    // Rect figé au début du drag (la zone est fixe et non transformée) :
    // sert à signaler si le lâcher garderait la tâche (dedans) ou la
    // libérerait (dehors), sans getBoundingClientRect par frame.
    const zoneRect = zoneRef.current ? zoneRef.current.getBoundingClientRect() : null;
    let wasHome = null;
    let raf;
    let gx = pointerRef.current.x;
    let gy = pointerRef.current.y;
    let vx = 0;
    let vy = 0;
    const loop = () => {
      const { x, y } = pointerRef.current;
      if (zoneRect) {
        const home =
          x >= zoneRect.left && x <= zoneRect.right &&
          y >= zoneRect.top && y <= zoneRect.bottom;
        if (home !== wasHome) {
          wasHome = home;
          setDragHome(home);
        }
      }
      const nx = gx + (x - gx) * 0.22;
      const ny = gy + (y - gy) * 0.22;
      vx = vx * 0.78 + (nx - gx);
      vy = vy * 0.78 + (ny - gy);
      gx = nx;
      gy = ny;
      if (ghostRef.current) {
        ghostRef.current.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      }
      if (deformRef.current) {
        const speed = Math.hypot(vx, vy);
        const stretch = Math.min(speed / 110, 0.18);
        const ang = ((Math.atan2(vy, vx) * 180) / Math.PI).toFixed(1);
        deformRef.current.style.transform =
          `rotate(${ang}deg) scale(${(1 + stretch).toFixed(3)}, ${(1 - stretch * 0.6).toFixed(3)}) rotate(${-ang}deg)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      cancelAnimationFrame(raf);
    };
  }, [dragOut]);
  const [reduced, setReduced] = useState(() => {
    try {
      return localStorage.getItem(FOCUS_REDUCED_STORAGE_KEY) === "1";
    } catch (e) {
      return false;
    }
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try {
      localStorage.setItem(FOCUS_REDUCED_STORAGE_KEY, reduced ? "1" : "0");
    } catch (e) {
      // stockage indisponible, le réglage reste appliqué pour la session
    }
  }, [reduced]);

  // Rafraîchit l'affichage du temps de focus écoulé.
  useEffect(() => {
    if (!task || !startedAt) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(iv);
  }, [task && task.id, startedAt]);

  const st = task ? statusOf(task.statut) : null;
  const seq = task ? statusesForTask(task) : [];
  const nextSt = task
    ? seq[Math.min(seq.findIndex((s) => s.id === task.statut) + 1, seq.length - 1)]
    : null;
  const elapsed = task && startedAt ? focusMinutes(startedAt, now) : 0;

  const dndProps = {
    onDragOver: (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      // La tâche déjà focalisée peut être relâchée dans la zone (annulation)
      // sans déclencher le halo d'accueil.
      const isSelf = Array.from(e.dataTransfer.types).includes(FOCUS_DRAG_TYPE);
      if (!isSelf && !over) setOver(true);
    },
    onDragLeave: (e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOver(false);
    },
    onDrop: (e) => {
      e.preventDefault();
      setOver(false);
      const id = e.dataTransfer.getData("text/plain");
      if (id) {
        onDropTask(id);
        setReduced(false);
      }
    },
  };

  if (reduced) {
    return (
      <div
        className={
          "trk-focus-zone trk-focus-reduced" +
          (task ? " occupied" : "") +
          (over ? " over" : "")
        }
        {...dndProps}
        role="region"
        aria-label={t("focus_zone_title")}
      >
        <button
          type="button"
          className="trk-focus-mini"
          onClick={() => setReduced(false)}
          title={t("focus_expand")}
          aria-label={t("focus_expand")}
        >
          <Flame size={15} className={task ? "trk-focus-flame" : undefined} />
          {task && <span className="trk-mono">{formatDuration(elapsed)}</span>}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={zoneRef}
      className={
        "trk-focus-zone" +
        (task ? " occupied" : "") +
        (over ? " over" : "") +
        (leaving ? " leaving" : "") +
        (dragOut ? (dragHome ? " drag-out drag-home" : " drag-out drag-away") : "")
      }
      {...dndProps}
      role="region"
      aria-label={t("focus_zone_title")}
    >
      {task && (
        <div className="trk-focus-smoke" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
      )}
      <div className="trk-focus-shell">
        <div className="trk-focus-inner">
          <div className="trk-focus-head">
            <Target size={12} />
            <span>{t("focus_zone_title")}</span>
            <span className="trk-focus-help" tabIndex={0}>
              <HelpCircle size={11} />
              <span className="trk-focus-help-tip" role="tooltip">{t("focus_zone_tooltip")}</span>
            </span>
            {task && (
              <span className="trk-focus-cooking">
                <Flame size={11} className="trk-focus-flame" />
                {t("focus_cooking")}
                <span className="trk-focus-dots"><i /><i /><i /></span>
              </span>
            )}
            <button
              type="button"
              className="trk-icon-btn trk-focus-reduce-btn"
              onClick={() => setReduced(true)}
              title={t("focus_reduce")}
              aria-label={t("focus_reduce")}
            >
              <Minus size={12} />
            </button>
          </div>
          {task ? (
            <div key={enterKey} className="trk-focus-card">
              <button
                type="button"
                className="trk-focus-task-btn"
                onClick={() => onEdit(task)}
                title={t("edit_task")}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", task.id);
                  e.dataTransfer.setData(FOCUS_DRAG_TYPE, "1");
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setDragImage(getEmptyDragImage(), 0, 0);
                  pointerRef.current = { x: e.clientX, y: e.clientY };
                  dragTitleRef.current = task.titre;
                  clearTimeout(popTimerRef.current);
                  setGhostPop(false);
                  setDragHome(true);
                  setDragOut(true);
                }}
                onDragEnd={(e) => {
                  setDragOut(false);
                  // La goutte éclate sur place puis s'évapore.
                  setGhostPop(true);
                  clearTimeout(popTimerRef.current);
                  popTimerRef.current = setTimeout(() => setGhostPop(false), 500);
                  // Déposée hors de la zone = libération (équivalent du bouton X).
                  const zone = zoneRef.current;
                  if (!zone || (e.clientX === 0 && e.clientY === 0)) return;
                  const r = zone.getBoundingClientRect();
                  const inside =
                    e.clientX >= r.left && e.clientX <= r.right &&
                    e.clientY >= r.top && e.clientY <= r.bottom;
                  if (!inside) onRelease();
                }}
              >
                <p className="trk-focus-title">{task.titre}</p>
                <div className="trk-focus-meta">
                  <span className="trk-tag" style={{ "--pill-color": projectColor(task.projet) }}>{task.projet}</span>
                  <span className="trk-status-pill" style={{ "--pill-color": st.color }}>{t(`status_${st.id}`)}</span>
                  <span className="trk-focus-timer">
                    <Clock size={10} /> {formatDuration(elapsed)}
                  </span>
                </div>
              </button>
              <div className="trk-focus-actions">
                <button
                  type="button"
                  className="trk-focus-done-btn"
                  onClick={onAdvance}
                  title={isSimpleTask(task) ? t("focus_mark_done") : t("focus_advance")}
                >
                  {isSimpleTask(task) ? (
                    <><Check size={13} /> {t("focus_mark_done")}</>
                  ) : (
                    <>{t(`status_${nextSt.id}`)} <ArrowRight size={13} /></>
                  )}
                </button>
                <button type="button" className="trk-icon-btn" onClick={onRelease} title={t("focus_release")} aria-label={t("focus_release")}>
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <div className="trk-focus-empty">
              <div className="trk-focus-empty-ring"><Flame size={18} /></div>
              <p>{t("focus_zone_empty")}</p>
              <span>{t("focus_zone_hint")}</span>
            </div>
          )}
        </div>
      </div>
      {(dragOut || ghostPop) && (
        <div
          ref={ghostRef}
          className={
            "trk-focus-ghost" +
            (dragHome ? " home" : " away") +
            (ghostPop ? " pop" : "")
          }
          style={{
            transform: `translate3d(${pointerRef.current.x}px, ${pointerRef.current.y}px, 0)`,
          }}
          aria-hidden="true"
        >
          <div ref={deformRef} className="trk-focus-ghost-deform">
            <div className="trk-focus-ghost-body">
              <Flame size={12} />
              <span>{dragTitleRef.current}</span>
            </div>
            <span className="trk-focus-ghost-drops">
              <i /><i /><i /><i /><i /><i />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ label, actionLabel, onAction }) {
  return (
    <div className="trk-empty trk-empty-rich">
      <ClipboardList size={30} strokeWidth={1.4} aria-hidden="true" />
      <p>{label}</p>
      {onAction && (
        <button type="button" className="trk-add-btn" onClick={onAction}>
          <Plus size={15} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

function MarkdownEditor({ id, value, onChange, mode, onModeChange, placeholder }) {
  const { t } = useLang();
  const html = useMemo(() => renderMarkdown(value), [value]);
  const modes = [
    { id: "write", label: t("md_mode_write"), icon: Pilcrow },
    { id: "preview", label: t("md_mode_preview"), icon: Eye },
    { id: "split", label: t("md_mode_split"), icon: Columns2 },
  ];
  return (
    <div className={"trk-md-editor" + (mode === "split" ? " trk-md-editor-split" : "")}>
      <div className="trk-md-toolbar">
        <div className="trk-md-tabs" role="tablist" aria-label={t("field_description")}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={"trk-md-tab" + (mode === m.id ? " active" : "")}
              onClick={() => onModeChange(m.id)}
            >
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>
        <a
          className="trk-md-hint"
          href="https://www.markdownguide.org/basic-syntax/"
          target="_blank"
          rel="noreferrer"
          title={t("md_syntax_hint")}
        >
          <HelpCircle size={13} /> {t("md_syntax_hint")}
        </a>
      </div>
      <div className="trk-md-panes">
        {mode !== "preview" && (
          <textarea
            id={id}
            className="trk-md-textarea"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
          />
        )}
        {mode !== "write" && (
          <div
            className={"trk-md-preview" + (!value.trim() ? " trk-md-preview-empty" : "")}
            aria-label={t("md_mode_preview")}
          >
            {value.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              t("md_preview_empty")
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { t, lang } = useLang();
  const [loading, setLoading] = useState(true);
  const [maximized, setMaximized] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [filterProjects, setFilterProjects] = useState([]);
  const [filterStatuts, setFilterStatuts] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("priorite");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [descMode, setDescMode] = useState("write");
  const [confirmCloseTask, setConfirmCloseTask] = useState(false);
  const originalEditingRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProject, setRenamingProject] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [timeLogTaskId, setTimeLogTaskId] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [toast, setToast] = useState(null);
  const [ioBusy, setIoBusy] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [projectSearch, setProjectSearch] = useState("");
  const [celebration, setCelebration] = useState(null);
  const [miniCeleb, setMiniCeleb] = useState(null);
  const prevAllDone = useRef(null);
  const [focusId, setFocusId] = useState(() => {
    try {
      return localStorage.getItem(FOCUS_STORAGE_KEY) || null;
    } catch (e) {
      return null;
    }
  });
  const [focusStartedAt, setFocusStartedAt] = useState(() => {
    try {
      const v = localStorage.getItem(FOCUS_STARTED_STORAGE_KEY);
      return v ? parseInt(v, 10) || null : null;
    } catch (e) {
      return null;
    }
  });
  const [focusLeaving, setFocusLeaving] = useState(false);
  const [focusEnterKey, setFocusEnterKey] = useState(0);
  const [focusNow, setFocusNow] = useState(() => Date.now());

  // Fait avancer l'affichage du temps accumulé pendant une session de focus.
  useEffect(() => {
    if (!focusId || !focusStartedAt) return;
    setFocusNow(Date.now());
    const iv = setInterval(() => setFocusNow(Date.now()), 10000);
    return () => clearInterval(iv);
  }, [focusId, focusStartedAt]);

  const liveMinutesFor = (task) => liveTaskMinutes(task, focusId, focusStartedAt, focusNow);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || "dark";
    } catch (e) {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (e) {
      // stockage indisponible, le thème reste appliqué pour la session
    }
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const [celebrationsOn, setCelebrationsOn] = useState(() => {
    try {
      return localStorage.getItem(CELEBRATIONS_STORAGE_KEY) !== "off";
    } catch (e) {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(CELEBRATIONS_STORAGE_KEY, celebrationsOn ? "on" : "off");
    } catch (e) {
      // stockage indisponible, le réglage reste appliqué pour la session
    }
  }, [celebrationsOn]);

  const toggleCelebrations = () => {
    setCelebrationsOn((prev) => {
      if (prev) {
        // Coupe aussi tout effet en cours.
        setCelebration(null);
        setMiniCeleb(null);
      }
      return !prev;
    });
  };

  useEffect(() => {
    (async () => {
      let initialProjects = DEFAULT_PROJECTS;
      try {
        if (window.config) {
          const configProjects = await window.config.getProjects();
          if (Array.isArray(configProjects) && configProjects.length) initialProjects = configProjects;
        }
      } catch (e) {
        // config.json absent/illisible, on part des valeurs par défaut
      }
      try {
        const res = await window.storage.get(STORAGE_KEY, false);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
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

  useEffect(() => {
    if (!window.windowControls) return;
    window.windowControls.isMaximized().then(setMaximized);
    return window.windowControls.onMaximizedChanged(setMaximized);
  }, []);

  const persist = async (nextTasks, nextProjects) => {
    try {
      const result = await window.storage.set(
        STORAGE_KEY,
        JSON.stringify({ tasks: nextTasks, projects: nextProjects }),
        false
      );
      setSaveError(!result);
    } catch (e) {
      setSaveError(true);
    }
    try {
      if (window.config) await window.config.setProjects(nextProjects);
    } catch (e) {
      // la synchronisation du fichier de config a échoué, la sauvegarde principale reste valide
    }
  };

  const saveTasks = (next) => {
    setTasks(next);
    persist(next, projects);
  };

  const saveProjects = (next) => {
    setProjects(next);
    persist(tasks, next);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modalOpen && !pendingImport) return;
    const handler = (e) => {
      if (e.key !== "Escape") return;
      if (confirmCloseTask) {
        setConfirmCloseTask(false);
        return;
      }
      if (modalOpen) {
        requestCloseTaskModal();
        return;
      }
      setPendingImport(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [modalOpen, pendingImport, confirmCloseTask, editing]);

  const exportData = async () => {
    if (!window.dataIO || ioBusy) return;
    setIoBusy(true);
    try {
      const result = await window.dataIO.export(buildBackupPayload(tasks, projects));
      if (!result.canceled) setToast({ type: "success", text: t("export_success") });
    } catch (e) {
      setToast({ type: "error", text: t("export_error") });
    } finally {
      setIoBusy(false);
    }
  };

  const importData = async () => {
    if (!window.dataIO || ioBusy) return;
    setIoBusy(true);
    try {
      const result = await window.dataIO.import();
      if (result.canceled) return;
      if (result.error || !isValidBackupData(result.data)) {
        setToast({ type: "error", text: t("import_invalid") });
        return;
      }
      setPendingImport(result.data);
    } catch (e) {
      setToast({ type: "error", text: t("import_error") });
    } finally {
      setIoBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const nextTasks = pendingImport.tasks;
    const nextProjects = pendingImport.projects;
    setTasks(nextTasks);
    setProjects(nextProjects);
    persist(nextTasks, nextProjects);
    setFilterProjects([]);
    setFilterStatuts([]);
    setPendingImport(null);
    setToast({ type: "success", text: t("import_success") });
  };

  const openNewTask = () => {
    const draft = {
      id: null,
      type: "standard",
      projet: (filterProjects.length === 1 ? filterProjects[0] : projects[0]) || "",
      titre: "",
      description: "",
      priorite: "moyenne",
      statut: "analyser",
      assigne: "",
      dateDebut: new Date().toISOString().slice(0, 10),
      echeance: "",
      timeLogs: [],
    };
    setEditing(draft);
    originalEditingRef.current = draft;
    setDescMode("write");
    setModalOpen(true);
  };

  const openEditTask = (t) => {
    setEditing({ ...t });
    originalEditingRef.current = { ...t };
    setDescMode("write");
    setModalOpen(true);
  };

  const isEditingDirty = () =>
    !!editing && JSON.stringify(editing) !== JSON.stringify(originalEditingRef.current);

  const closeTaskModal = () => {
    setModalOpen(false);
    setEditing(null);
    setConfirmCloseTask(false);
  };

  const requestCloseTaskModal = () => {
    if (isEditingDirty()) setConfirmCloseTask(true);
    else closeTaskModal();
  };

  const submitTask = (e) => {
    e.preventDefault();
    if (!editing.titre.trim() || !editing.projet.trim()) return;
    if (editing.id) {
      const prev = tasks.find((t) => t.id === editing.id);
      const next = tasks.map((t) => (t.id === editing.id ? editing : t));
      saveTasks(next);
      if (prev && !isTaskDone(prev)) celebrateTaskDone(editing.statut, next);
    } else {
      saveTasks([...tasks, { ...editing, id: uid() }]);
    }
    closeTaskModal();
  };

  const deleteTask = (id) => {
    saveTasks(tasks.filter((t) => t.id !== id));
    setConfirmDelete(null);
  };

  const addTimeLog = (taskId, minutes, note) => {
    saveTasks(
      tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              timeLogs: [
                ...(t.timeLogs || []),
                { id: uid(), minutes, note, date: new Date().toISOString().slice(0, 10) },
              ],
            }
          : t
      )
    );
  };

  const deleteTimeLog = (taskId, logId) => {
    saveTasks(
      tasks.map((t) =>
        t.id === taskId ? { ...t, timeLogs: (t.timeLogs || []).filter((l) => l.id !== logId) } : t
      )
    );
  };

  const editTimeLog = (taskId, logId, minutes, note) => {
    saveTasks(
      tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              timeLogs: (t.timeLogs || []).map((l) => (l.id === logId ? { ...l, minutes, note } : l)),
            }
          : t
      )
    );
  };

  const addTimeLogToEditing = (minutes, note) => {
    const entry = { id: uid(), minutes, note, date: new Date().toISOString().slice(0, 10) };
    saveTasks(
      tasks.map((t) => (t.id === editing.id ? { ...t, timeLogs: [...(t.timeLogs || []), entry] } : t))
    );
    setEditing((prev) => ({ ...prev, timeLogs: [...(prev.timeLogs || []), entry] }));
  };

  const deleteTimeLogFromEditing = (logId) => {
    saveTasks(
      tasks.map((t) =>
        t.id === editing.id ? { ...t, timeLogs: (t.timeLogs || []).filter((l) => l.id !== logId) } : t
      )
    );
    setEditing((prev) => ({ ...prev, timeLogs: (prev.timeLogs || []).filter((l) => l.id !== logId) }));
  };

  const editTimeLogInEditing = (logId, minutes, note) => {
    saveTasks(
      tasks.map((t) =>
        t.id === editing.id
          ? {
              ...t,
              timeLogs: (t.timeLogs || []).map((l) => (l.id === logId ? { ...l, minutes, note } : l)),
            }
          : t
      )
    );
    setEditing((prev) => ({
      ...prev,
      timeLogs: (prev.timeLogs || []).map((l) => (l.id === logId ? { ...l, minutes, note } : l)),
    }));
  };

  const addProject = () => {
    const name = newProjectName.trim();
    if (name && !projects.includes(name)) {
      saveProjects([...projects, name]);
    }
    setNewProjectName("");
    setAddingProject(false);
  };

  const removeProject = (name) => {
    if (tasks.some((t) => t.projet === name)) return;
    saveProjects(projects.filter((p) => p !== name));
    setFilterProjects((prev) => prev.filter((p) => p !== name));
  };

  const toggleFilterProject = (name) => {
    setFilterProjects((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const toggleFilterStatut = (id) => {
    setFilterStatuts((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const startRenameProject = (name) => {
    setRenamingProject(name);
    setRenameValue(name);
  };

  const cancelRenameProject = () => {
    setRenamingProject(null);
    setRenameValue("");
  };

  const confirmRenameProject = () => {
    const oldName = renamingProject;
    const newName = renameValue.trim();
    cancelRenameProject();
    if (!oldName || !newName || newName === oldName) return;
    if (projects.includes(newName)) return;

    const nextProjects = projects.map((p) => (p === oldName ? newName : p));
    const nextTasks = tasks.map((t) => (t.projet === oldName ? { ...t, projet: newName } : t));
    setTasks(nextTasks);
    setProjects(nextProjects);
    persist(nextTasks, nextProjects);
    setFilterProjects((prev) => prev.map((p) => (p === oldName ? newName : p)));
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(
      (t) =>
        (!filterProjects.length || filterProjects.includes(t.projet)) &&
        (!filterStatuts.length ||
          filterStatuts.includes(t.statut) ||
          (filterStatuts.includes("termine") && isTaskDone(t))) &&
        (!search || t.titre.toLowerCase().includes(search.toLowerCase()))
    );
  }, [tasks, filterProjects, filterStatuts, search]);

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    arr.sort((a, b) => {
      if (sortBy === "priorite") return prioOf(a.priorite).order - prioOf(b.priorite).order;
      if (sortBy === "statut") return statusOf(a.statut).weight - statusOf(b.statut).weight;
      if (sortBy === "projet") return a.projet.localeCompare(b.projet);
      if (sortBy === "echeance") return (a.echeance || "9999-99-99").localeCompare(b.echeance || "9999-99-99");
      return 0;
    });
    return arr;
  }, [filteredTasks, sortBy]);

  const listResetKey = `${filterProjects.join(",")}|${filterStatuts.join(",")}|${search}|${sortBy}`;
  const {
    page: currentPage, setPage, totalPages, pageItems: pagedTasks,
  } = usePagination(sortedTasks, PAGE_SIZE, listResetKey);

  const moveTask = (id, statut) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.statut === statut) return;
    if (!statusesForTask(task).some((s) => s.id === statut)) return;
    const next = tasks.map((t) => (t.id === id ? { ...t, statut } : t));
    saveTasks(next);
    celebrateTaskDone(statut, next);
  };

  // Mini célébration quand une tâche passe à « terminé », sauf si tout est
  // terminé (la grande célébration prend le relais).
  const celebrateTaskDone = (statut, nextTasks) => {
    if (!celebrationsOn) return;
    if (!isDoneStatus(statut)) return;
    if (nextTasks.every(isTaskDone)) return;
    setMiniCeleb(Date.now());
  };

  // ── Zone de focus ──
  useEffect(() => {
    try {
      if (focusId) localStorage.setItem(FOCUS_STORAGE_KEY, focusId);
      else localStorage.removeItem(FOCUS_STORAGE_KEY);
    } catch (e) {
      // stockage indisponible, le focus reste appliqué pour la session
    }
  }, [focusId]);

  useEffect(() => {
    try {
      if (focusStartedAt) localStorage.setItem(FOCUS_STARTED_STORAGE_KEY, String(focusStartedAt));
      else localStorage.removeItem(FOCUS_STARTED_STORAGE_KEY);
    } catch (e) {
      // stockage indisponible, le pointage reste appliqué pour la session
    }
  }, [focusStartedAt]);

  const focusTask = useMemo(
    () => tasks.find((t) => t.id === focusId) || null,
    [tasks, focusId]
  );

  // Pointage : ajoute le temps de focus écoulé (plafonné à 8h/jour) à la tâche.
  const logFocusTime = (list, taskId) => {
    if (!focusStartedAt || !taskId) return list;
    const minutes = focusMinutes(focusStartedAt, Date.now());
    if (minutes < 1) return list;
    const entry = {
      id: uid(),
      minutes,
      note: t("focus_log_note"),
      date: new Date().toISOString().slice(0, 10),
    };
    return list.map((tk) =>
      tk.id === taskId ? { ...tk, timeLogs: [...(tk.timeLogs || []), entry] } : tk
    );
  };

  // Si la tâche focalisée est supprimée, on libère la zone (sans pointage :
  // la tâche n'existe plus).
  useEffect(() => {
    if (loading) return;
    if (focusId && !focusTask) {
      setFocusId(null);
      setFocusStartedAt(null);
      setFocusLeaving(false);
    }
    if (!focusId && focusStartedAt) setFocusStartedAt(null);
  }, [loading, focusId, focusTask, focusStartedAt]);

  // Sortie automatique (animée) dès que la tâche focalisée est terminée,
  // quel que soit l'endroit où elle a été terminée (kanban, modal, zone).
  // Le temps de focus est pointé au moment de la sortie.
  useEffect(() => {
    if (!focusTask) return;
    if (!isTaskDone(focusTask)) {
      setFocusLeaving(false);
      return;
    }
    setFocusLeaving(true);
    const timer = setTimeout(() => {
      if (focusStartedAt) saveTasks(logFocusTime(tasks, focusTask.id));
      setFocusId(null);
      setFocusStartedAt(null);
      setFocusLeaving(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [focusTask]);

  const focusOnTask = (id) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || isTaskDone(task) || focusLeaving || id === focusId) return;
    // Échange : le temps de la tâche sortante est pointé avant de la remplacer.
    if (focusId && focusStartedAt) saveTasks(logFocusTime(tasks, focusId));
    setFocusId(id);
    setFocusStartedAt(Date.now());
    setFocusEnterKey((k) => k + 1);
  };

  // Tâche simple : passe directement à « done ». Tâche workflow : avance
  // d'un seul statut (la sortie n'a lieu qu'en atteignant « terminé »).
  const advanceFocusTask = () => {
    if (!focusTask) return;
    const seq = statusesForTask(focusTask);
    const idx = seq.findIndex((s) => s.id === focusTask.statut);
    const nextId = isSimpleTask(focusTask)
      ? "done"
      : seq[Math.min(idx + 1, seq.length - 1)].id;
    moveTask(focusTask.id, nextId);
  };

  const releaseFocus = () => {
    if (focusId && focusStartedAt) saveTasks(logFocusTime(tasks, focusId));
    setFocusId(null);
    setFocusStartedAt(null);
    setFocusLeaving(false);
  };

  const globalProgress = useMemo(() => {
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, t) => acc + statusOf(t.statut).weight, 0);
    return Math.round(sum / tasks.length);
  }, [tasks]);

  const projectProgress = useMemo(() => {
    return projects.map((p) => {
      const pt = tasks.filter((t) => t.projet === p);
      const avg = pt.length ? Math.round(pt.reduce((a, t) => a + statusOf(t.statut).weight, 0) / pt.length) : 0;
      return { name: p, progress: avg, count: pt.length };
    });
  }, [projects, tasks]);

  const visibleProjects = useMemo(
    () => projectProgress.filter((p) => matchesQuery(p.name, projectSearch)),
    [projectProgress, projectSearch]
  );
  const {
    page: projectPage, setPage: setProjectPage,
    totalPages: projectTotalPages, pageItems: pagedProjects,
  } = usePagination(visibleProjects, PROJECT_PAGE_SIZE, projectSearch);

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
      const row = { projet: p };
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

  const doneCount = tasks.filter(isTaskDone).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  // Célébration au passage à « tout terminé » (jamais au chargement initial).
  useEffect(() => {
    if (loading) return;
    if (prevAllDone.current === null) {
      prevAllDone.current = allDone;
      return;
    }
    if (allDone && !prevAllDone.current && celebrationsOn) setCelebration(pickCelebration());
    prevAllDone.current = allDone;
  }, [allDone, loading, celebrationsOn]);

  // La grande célébration remplace toute mini en attente : sans ça, une mini
  // masquée par la grande rejouerait toute seule une fois celle-ci terminée.
  useEffect(() => {
    if (celebration) setMiniCeleb(null);
  }, [celebration]);

  return (
    <div className={"trk-app" + (maximized ? " trk-app-maximized" : "") + (theme === "light" ? " light" : "")}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .trk-app {
          /* Design tokens — dark (default) */
          --bg: #10141A;
          --panel: #181E26;
          --panel-alt: #1D2430;
          --border: #2A323D;
          --text: #E8EBEE;
          --text-dim: #8B95A1;
          --accent: #35A7A0;
          --accent-contrast: #0E1216;
          --inset: #0E1216;
          --gauge-track: #1F2530;
          --titlebar-bg: #0C0F14;
          --overlay: rgba(8, 10, 13, 0.7);
          --shadow: rgba(0, 0, 0, 0.38);
          --danger: #D64545;
          --warn: #E08A3C;
          --ok: #4CAF6D;
          /* Layout tokens — spacing scale, control sizing, radii */
          --space-1: 4px;
          --space-2: 8px;
          --space-3: 12px;
          --space-4: 16px;
          --space-5: 20px;
          --control-h: 34px;
          --control-h-sm: 26px;
          --radius-sm: 6px;
          --radius-md: 8px;
          --radius-lg: 10px;
          /* Hauteur commune des vues (kanban / liste) ; la sidebar y ajoute
             la barre d'outils (recherche) pour rester alignée. */
          --board-h: 520px;
          --toolbar-h: calc(var(--control-h) + 14px);
          color-scheme: dark;
          font-family: 'Inter', sans-serif;
          background: var(--bg);
          color: var(--text);
          height: 100vh;
          display: flex;
          flex-direction: column;
          box-sizing: border-box;
          border: 1px solid var(--border);
          border-radius: 20px;
          overflow: hidden;
          transition: border-radius 0.15s ease, background 0.25s ease, color 0.25s ease;
        }
        .trk-app.light {
          /* Design tokens — light */
          --bg: #EFF2F6;
          --panel: #FFFFFF;
          --panel-alt: #EDF0F4;
          --border: #D7DDE5;
          --text: #1B2430;
          --text-dim: #5B6675;
          --accent: #1E8C85;
          --accent-contrast: #FFFFFF;
          --inset: #E1E6EC;
          --gauge-track: #E1E6EC;
          --titlebar-bg: #E6EAEF;
          --overlay: rgba(27, 36, 48, 0.45);
          --shadow: rgba(20, 30, 42, 0.14);
          --danger: #C23A3A;
          --warn: #B26B22;
          --ok: #35855A;
          color-scheme: light;
        }
        .trk-app.trk-app-maximized {
          border-radius: 0;
          border: none;
        }
        .trk-app * { box-sizing: border-box; }
        .trk-mono { font-family: 'IBM Plex Mono', monospace; }
        .trk-display { font-family: 'Space Grotesk', sans-serif; }

        /* Focus visible au clavier, partout */
        .trk-app button:focus-visible,
        .trk-app input:focus-visible,
        .trk-app select:focus-visible,
        .trk-app textarea:focus-visible,
        .trk-app [draggable]:focus-visible {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          border-radius: 6px;
        }
        .trk-search:focus-within,
        .trk-kanban-col-search:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }
        .trk-field input:focus,
        .trk-field select:focus,
        .trk-field textarea:focus,
        .trk-add-project-input:focus,
        .trk-timelog-add input:focus {
          border-color: var(--accent);
          outline: none;
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
        }

        /* Micro-interactions */
        @keyframes trk-toast-in {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes trk-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes trk-pop-in {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: none; }
        }
        @keyframes trk-row-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .trk-app, .trk-app * {
            animation: none !important;
            transition: none !important;
          }
        }

        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb {
          background-color: rgba(139, 149, 161, 0.35);
          border-radius: 8px;
          border: 2px solid transparent;
          background-clip: content-box;
        }
        ::-webkit-scrollbar-thumb:hover { background-color: rgba(139, 149, 161, 0.6); }
        ::-webkit-scrollbar-corner { background: transparent; }

        .trk-titlebar {
          -webkit-app-region: drag;
          display: flex;
          align-items: center;
          height: 38px;
          background: var(--titlebar-bg);
          border-bottom: 1px solid var(--border);
          user-select: none;
        }
        .trk-traffic-lights {
          -webkit-app-region: no-drag;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding-left: 14px;
          padding-right: 14px;
        }
        .trk-traffic-btn {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          border: none;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: inset 0 0 0 0.5px rgba(0,0,0,0.15);
        }
        .trk-traffic-close { background: #FF5F57; }
        .trk-traffic-minimize { background: #FEBC2E; }
        .trk-traffic-maximize { background: #28C840; }
        .trk-traffic-glyph {
          opacity: 0;
          color: rgba(0,0,0,0.55);
          pointer-events: none;
        }
        .trk-traffic-lights:hover .trk-traffic-glyph { opacity: 1; }
        .trk-traffic-btn:active { filter: brightness(0.85); }

        .trk-titlebar-drag {
          flex: 1;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding-left: 14px;
        }
        .trk-titlebar-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11.5px;
          letter-spacing: 0.5px;
          color: var(--text-dim);
        }

        .trk-content { padding: 24px; flex: 1; min-height: 0; overflow-y: auto; }
        @media (max-width: 640px) {
          .trk-content { padding: var(--space-4); }
        }

        .trk-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: var(--space-5);
          padding-bottom: var(--space-5);
          border-bottom: 1px solid var(--border);
          margin-bottom: var(--space-5);
          flex-wrap: wrap;
          row-gap: var(--space-3);
        }
        .trk-header-brand {
          flex: 1 1 auto;
          min-width: 180px;
        }
        .trk-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 1.5px;
          color: var(--accent);
        }
        .trk-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 26px;
          font-weight: 700;
          margin: 4px 0 0 0;
        }
        .trk-gauge-block {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .trk-gauge-caption { text-align: left; }
        .trk-gauge-caption strong {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 15px;
          display: block;
        }
        .trk-gauge-caption span {
          font-size: 12px;
          color: var(--text-dim);
        }
        .trk-lang-switch {
          display: flex;
          align-items: stretch;
          gap: 3px;
          height: var(--control-h);
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 3px;
        }
        .trk-lang-btn {
          display: flex;
          align-items: center;
          background: none;
          border: none;
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          padding: 0 9px;
          border-radius: var(--radius-sm);
          cursor: pointer;
        }
        .trk-lang-btn.active { background: var(--accent); color: var(--accent-contrast); }

        .trk-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          margin-left: auto;
        }
        .trk-io-group {
          display: flex;
          align-items: stretch;
          gap: 3px;
          height: var(--control-h);
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 3px;
        }
        .trk-io-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 12px;
          font-weight: 500;
          padding: 0 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          white-space: nowrap;
        }
        .trk-io-btn:hover:not(:disabled) { color: var(--text); background: var(--panel-alt); }
        .trk-io-btn:disabled { opacity: 0.5; cursor: default; }
        .trk-theme-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text-dim);
          border-radius: var(--radius-md);
          width: var(--control-h);
          height: var(--control-h);
          flex-shrink: 0;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s;
        }
        .trk-theme-btn:hover { color: var(--accent); border-color: var(--accent); }
        .trk-theme-btn.trk-celeb-off {
          opacity: 0.45;
          position: relative;
        }
        .trk-theme-btn.trk-celeb-off::after {
          content: "";
          position: absolute;
          left: 6px;
          right: 6px;
          top: 50%;
          border-top: 1.5px solid currentColor;
          transform: rotate(-45deg);
        }

        .trk-toast {
          position: fixed;
          bottom: 22px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-left: 3px solid var(--accent);
          color: var(--text);
          font-size: 13px;
          padding: 10px 16px;
          border-radius: 8px;
          box-shadow: 0 8px 24px var(--shadow);
          z-index: 60;
          animation: trk-toast-in 0.25s ease;
        }
        .trk-toast.trk-toast-error { border-left-color: var(--danger); }

        .trk-layout {
          display: grid;
          grid-template-columns: 250px 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 860px) {
          .trk-layout { grid-template-columns: 1fr; }
          .trk-sidebar { height: auto; }
        }

        .trk-sidebar {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          height: calc(var(--board-h) + var(--toolbar-h));
          display: flex;
          flex-direction: column;
        }
        .trk-project-list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
        .trk-sidebar-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 1px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }
        .trk-project-card {
          padding: 10px;
          border-radius: 8px;
          margin-bottom: 6px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s, border-color 0.15s;
        }
        .trk-project-card:hover { background: var(--panel-alt); }
        .trk-project-card.active {
          background: var(--panel-alt);
          border-color: var(--project-color, var(--accent));
        }
        .trk-project-card-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .trk-project-name {
          font-size: 13px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .trk-project-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .trk-project-count {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--text-dim);
        }
        .trk-project-remove {
          opacity: 0;
          background: none;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          padding: 2px;
        }
        .trk-project-card:hover .trk-project-remove { opacity: 1; }
        .trk-pbar {
          background: var(--inset);
          border-radius: 4px;
          overflow: hidden;
        }
        .trk-pbar-fill {
          height: 100%;
          border-radius: 4px;
          transition: width 0.4s ease;
        }
        .trk-all-btn {
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 12px;
          padding: 6px 10px;
          cursor: pointer;
          border-radius: 6px;
          margin-bottom: 8px;
        }
        .trk-all-btn.active { color: var(--accent); background: var(--panel-alt); }
        /* flex: none — .trk-kanban-col-search a flex:1, ce qui la ferait
           grandir verticalement dans la sidebar en colonne. Deux classes
           pour l'emporter sur la règle définie plus bas. */
        .trk-kanban-col-search.trk-project-search { margin-bottom: 8px; flex: none; }
        .trk-project-pager {
          display: flex;
          justify-content: center;
          margin-top: 8px;
        }
        .trk-add-project-row {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 6px;
          min-width: 0;
        }
        .trk-add-project-input {
          flex: 1;
          min-width: 0;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          border-radius: 6px;
          color: var(--text);
          font-size: 12px;
          padding: 6px 8px;
        }
        .trk-ghost-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: 1px dashed var(--border);
          color: var(--text-dim);
          border-radius: 6px;
          padding: 7px 10px;
          font-size: 12px;
          cursor: pointer;
          width: 100%;
          margin-top: 8px;
          justify-content: center;
        }
        .trk-ghost-btn:hover { color: var(--accent); border-color: var(--accent); }

        .trk-main { min-width: 0; }
        .trk-toolbar {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 14px;
          flex-wrap: wrap;
        }
        .trk-search {
          display: flex;
          align-items: center;
          gap: 6px;
          height: var(--control-h);
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 0 10px;
          flex: 1;
          min-width: 160px;
        }
        .trk-search input {
          background: none;
          border: none;
          color: var(--text);
          font-size: 13px;
          outline: none;
          width: 100%;
        }
        .trk-select {
          height: var(--control-h);
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: var(--radius-md);
          padding: 0 10px;
          font-size: 13px;
          cursor: pointer;
        }
        .trk-multiselect { position: relative; }
        .trk-multiselect-btn {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .trk-multiselect-btn.active {
          border-color: var(--accent);
          color: var(--accent);
        }
        .trk-multiselect-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 20;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 8px;
          min-width: 180px;
          box-shadow: 0 8px 24px var(--shadow);
        }
        .trk-multiselect-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          padding: 6px 4px;
          border-radius: 5px;
          cursor: pointer;
        }
        .trk-multiselect-item:hover { background: var(--panel-alt); }
        .trk-multiselect-item input { cursor: pointer; }
        .trk-multiselect-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .trk-multiselect-clear {
          width: 100%;
          margin-top: 4px;
          background: none;
          border: none;
          border-top: 1px solid var(--border);
          color: var(--text-dim);
          font-size: 11.5px;
          padding: 8px 4px 2px;
          cursor: pointer;
          text-align: center;
        }
        .trk-multiselect-clear:hover { color: var(--accent); }
        .trk-filter-count {
          color: var(--accent);
          font-weight: normal;
        }
        .trk-add-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          height: var(--control-h);
          background: var(--accent);
          color: var(--accent-contrast);
          border: none;
          border-radius: var(--radius-md);
          padding: 0 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .trk-add-btn {
          transition: filter 0.15s, transform 0.1s, box-shadow 0.15s;
        }
        .trk-add-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 35%, transparent);
        }
        .trk-add-btn:active { transform: none; }

        .trk-task-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          height: var(--board-h);
          min-height: 0;
          overflow-y: auto;
        }
        .trk-task-list .trk-pagination { margin-top: auto; padding-top: 14px; }
        .trk-task-row {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          border-left: 4px solid var(--rail-color, var(--border));
          animation: trk-row-in 0.2s ease;
          transition: border-color 0.15s, box-shadow 0.15s, opacity 0.2s;
        }
        .trk-task-row:hover {
          border-color: color-mix(in srgb, var(--rail-color, var(--border)) 45%, var(--border));
          box-shadow: 0 4px 14px var(--shadow);
        }
        .trk-task-row.done { opacity: 0.72; }
        .trk-task-row.done .trk-task-title {
          text-decoration: line-through;
          text-decoration-color: var(--text-dim);
          color: var(--text-dim);
        }
        .trk-kanban-card.done { opacity: 0.72; }
        .trk-kanban-card.done .trk-kanban-card-title {
          text-decoration: line-through;
          text-decoration-color: var(--text-dim);
          color: var(--text-dim);
        }
        .trk-task-main { flex: 1; min-width: 0; }
        .trk-task-title { font-size: 14px; font-weight: 600; margin: 0 0 4px 0; }
        .trk-task-meta {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 11.5px;
          color: var(--text-dim);
          align-items: center;
        }
        .trk-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          height: 20px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          padding: 0 7px;
          border-radius: 4px;
          color: var(--pill-color, var(--text-dim));
          background: color-mix(in srgb, var(--pill-color, var(--text-dim)) 13%, transparent);
          border: 1px solid color-mix(in srgb, var(--pill-color, var(--text-dim)) 33%, transparent);
        }
        .trk-prio-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          height: 20px;
          font-size: 10.5px;
          font-weight: 600;
          padding: 0 7px;
          border-radius: 4px;
          color: var(--pill-color, var(--text-dim));
          background: color-mix(in srgb, var(--pill-color, var(--text-dim)) 13%, transparent);
        }
        .trk-status-pill {
          display: inline-flex;
          align-items: center;
          height: 20px;
          font-size: 10.5px;
          padding: 0 8px;
          border-radius: 10px;
          font-weight: 500;
          color: var(--pill-color, var(--text-dim));
          background: color-mix(in srgb, var(--pill-color, var(--text-dim)) 13%, transparent);
        }
        /* En thème clair, assombrir le texte des pastilles pour garder le contraste */
        .trk-app.light .trk-tag,
        .trk-app.light .trk-prio-tag,
        .trk-app.light .trk-status-pill {
          color: color-mix(in srgb, var(--pill-color, var(--text-dim)) 62%, black);
        }
        .trk-timelog-wrap { position: relative; display: inline-flex; }
        .trk-time-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 20px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--text-dim);
          font-size: 10.5px;
          font-family: 'IBM Plex Mono', monospace;
          padding: 0 7px;
          border-radius: 4px;
          cursor: pointer;
        }
        .trk-time-badge:hover { color: var(--accent); border-color: var(--accent); }
        .trk-time-badge.has-time { color: var(--text); }
        .trk-timelog-panel {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          z-index: 30;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
          min-width: 240px;
          box-shadow: 0 8px 24px var(--shadow);
        }
        .trk-timelog-total {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 600;
          color: var(--accent);
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .trk-timelog-add { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .trk-timelog-add input.trk-timelog-duration-input {
          width: 70px;
          flex: 0 0 70px;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 12px;
        }
        .trk-timelog-add input.trk-timelog-note-input {
          width: auto;
          flex: 1;
          min-width: 0;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 12px;
        }
        .trk-timelog-error {
          font-size: 10.5px;
          color: var(--danger);
          margin-bottom: 6px;
        }
        .trk-timelog-list {
          max-height: 140px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .trk-timelog-empty {
          font-size: 11px;
          color: var(--text-dim);
          text-align: center;
          padding: 6px 0;
        }
        .trk-timelog-entry {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          font-size: 11px;
          color: var(--text-dim);
        }
        .trk-timelog-entry-info {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .trk-timelog-entry-info strong { color: var(--text); }
        .trk-timelog-entry-edit {
          flex-wrap: wrap;
        }
        .trk-timelog-entry-edit input.trk-timelog-duration-input {
          width: 60px;
          flex: 0 0 60px;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 6px;
          padding: 4px 6px;
          font-size: 11px;
        }
        .trk-timelog-entry-edit input.trk-timelog-note-input {
          flex: 1;
          min-width: 60px;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 6px;
          padding: 4px 6px;
          font-size: 11px;
        }
        .trk-timelog-entry-edit .trk-timelog-error {
          width: 100%;
          margin: 2px 0 0;
        }
        .trk-timelog-inline {
          background: var(--panel-alt);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px;
        }
        .trk-timelog-hint {
          font-size: 12px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }

        .trk-view-switch {
          display: flex;
          align-items: stretch;
          gap: 3px;
          height: var(--control-h);
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 3px;
        }
        .trk-view-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 12px;
          font-weight: 500;
          padding: 0 10px;
          border-radius: var(--radius-sm);
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .trk-view-btn:hover { color: var(--text); }
        .trk-view-btn.active { background: var(--accent); color: var(--accent-contrast); }
        @media (max-width: 640px) {
          .trk-view-label { display: none; }
        }

        .trk-pagination {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 5px;
          margin-top: 14px;
          flex-wrap: wrap;
        }
        .trk-page-btn {
          min-width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          border-radius: 8px;
          cursor: pointer;
          transition: color 0.15s, border-color 0.15s, background 0.15s, transform 0.1s;
        }
        .trk-page-btn:hover:not(:disabled):not(.active) {
          color: var(--text);
          border-color: var(--accent);
          transform: translateY(-1px);
        }
        .trk-page-btn.active {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--accent-contrast);
          font-weight: 600;
        }
        .trk-page-btn:disabled { opacity: 0.35; cursor: default; }
        .trk-page-ellipsis {
          color: var(--text-dim);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          padding: 0 2px;
        }
        .trk-page-info {
          margin-left: 8px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: var(--text-dim);
        }

        .trk-kanban {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(210px, 1fr);
          gap: 12px;
          overflow-x: auto;
          /* Hauteur fixée sur le conteneur (pas les colonnes) : quand la
             scrollbar horizontale apparaît, elle est absorbée à l'intérieur
             au lieu d'ajouter 10px sous le tableau. */
          height: var(--board-h);
        }
        .trk-kanban-col {
          background: var(--panel);
          border: 1px solid var(--border);
          border-top: 3px solid var(--col-color, var(--border));
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          min-height: 0;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
        }
        @media (max-width: 1100px) {
          .trk-kanban {
            grid-auto-flow: row;
            grid-auto-columns: unset;
            grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
            overflow-x: visible;
            height: auto;
          }
          .trk-kanban-col { height: var(--board-h); }
        }
        .trk-kanban-col.drag-over {
          background: var(--panel-alt);
          border-color: var(--col-color, var(--accent));
          box-shadow: 0 0 0 1px var(--col-color, var(--accent)) inset;
        }
        .trk-kanban-col-header {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border);
        }
        .trk-kanban-col-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .trk-kanban-col-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--text);
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .trk-kanban-col-count {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          color: var(--text-dim);
          background: var(--panel-alt);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 1px 7px;
        }
        .trk-kanban-col-tools {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border);
        }
        .trk-kanban-col-search {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 5px;
          height: var(--control-h-sm);
          background: var(--panel-alt);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 0 7px;
        }
        .trk-kanban-col-search input {
          background: none;
          border: none;
          outline: none;
          color: var(--text);
          font-size: 11.5px;
          width: 100%;
          min-width: 0;
        }
        .trk-kanban-col-search .trk-icon-btn { padding: 1px; }
        .trk-kanban-col-prio {
          height: var(--control-h-sm);
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--text-dim);
          border-radius: var(--radius-sm);
          padding: 0 4px;
          font-size: 11px;
          cursor: pointer;
          flex: 0 0 auto;
          max-width: 45%;
        }
        .trk-kanban-col-prio.active { color: var(--accent); border-color: var(--accent); }
        .trk-kanban-col-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px;
          flex: 1;
          min-height: 0;
          overflow-y: auto;
        }
        .trk-kanban-col-footer {
          margin-top: auto;
          padding: 6px 10px 8px;
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: center;
        }
        .trk-pagination-compact {
          margin-top: 0;
          gap: 8px;
        }
        .trk-pagination-compact .trk-page-btn {
          min-width: 24px;
          height: 24px;
          border-radius: 6px;
        }
        .trk-pagination-compact .trk-page-info { margin-left: 0; }
        .trk-kanban-drop-hint {
          border: 1px dashed var(--border);
          border-radius: 8px;
          color: var(--text-dim);
          font-size: 11px;
          text-align: center;
          padding: 18px 8px;
          pointer-events: none;
        }
        .trk-kanban-card {
          background: var(--panel-alt);
          border: 1px solid var(--border);
          border-left: 3px solid var(--rail-color, var(--border));
          border-radius: 8px;
          padding: 10px 11px;
          cursor: grab;
          transition: transform 0.12s, box-shadow 0.12s, opacity 0.12s;
        }
        .trk-kanban-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px var(--shadow);
        }
        .trk-kanban-card:active { cursor: grabbing; }
        .trk-kanban-card.dragging { opacity: 0.4; }
        .trk-kanban-card-title {
          font-size: 12.5px;
          font-weight: 600;
          margin: 0 0 7px 0;
          line-height: 1.35;
          word-break: break-word;
          /* Hauteur de carte bornée : titre limité à 2 lignes pour que
             3 cartes tiennent toujours dans la colonne sans scroll. */
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .trk-kanban-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 8px;
        }
        .trk-kanban-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .trk-kanban-card-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 10.5px;
          color: var(--text-dim);
          min-width: 0;
        }
        .trk-kanban-time {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }
        .trk-kanban-card-actions {
          display: flex;
          align-items: center;
          gap: 2px;
          flex-shrink: 0;
        }
        .trk-kanban-card-actions .trk-icon-btn { padding: 4px; }

        .trk-task-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .trk-icon-btn {
          background: none;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          flex-shrink: 0;
        }
        .trk-icon-btn { transition: background 0.15s, color 0.15s; }
        .trk-icon-btn:hover { background: var(--panel-alt); color: var(--text); }
        .trk-icon-btn.trk-icon-danger { color: var(--danger); }
        .trk-icon-btn.trk-icon-danger:hover {
          background: color-mix(in srgb, var(--danger) 15%, transparent);
          color: var(--danger);
        }
        .trk-confirm { display: flex; gap: 4px; align-items: center; }
        .trk-confirm-label { font-size: 11px; color: var(--text-dim); }

        .trk-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--text-dim);
          font-size: 13px;
          border: 1px dashed var(--border);
          border-radius: 10px;
        }
        .trk-empty-rich {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 48px 20px;
        }
        .trk-empty-rich svg { color: var(--text-dim); opacity: 0.7; }
        .trk-empty-rich p { margin: 0; max-width: 340px; line-height: 1.5; }

        .trk-charts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--space-4);
          margin-top: var(--space-5);
        }
        @media (max-width: 860px) {
          .trk-charts { grid-template-columns: 1fr; }
        }
        .trk-chart-card {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 14px;
        }
        .trk-chart-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 10px;
        }
        .trk-chart-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.5px;
          color: var(--text-dim);
        }
        .trk-chart-head .trk-chart-title { margin-bottom: 0; }
        .trk-chart-focus-btn { padding: 4px; }
        .trk-chart-focus-btn:hover { color: var(--accent); }
        .trk-modal.trk-chart-modal {
          max-width: 1180px;
          width: min(1180px, 96vw);
        }
        .trk-chart-modal-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .trk-chart-details {
          width: 100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .trk-chart-details th {
          text-align: left;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          color: var(--text-dim);
          font-weight: 500;
          padding: 6px 10px;
          border-bottom: 1px solid var(--border);
        }
        .trk-chart-details td {
          padding: 7px 10px;
          border-bottom: 1px solid var(--border);
          color: var(--text);
        }
        .trk-chart-details tr:last-child td { border-bottom: none; }
        .trk-chart-details tr:hover td { background: var(--panel-alt); }
        .trk-gantt-focus .trk-gantt-body { max-height: 50vh; }

        .trk-gantt-card { margin-top: 16px; }
        .trk-gantt { font-size: 12px; }
        .trk-gantt-header {
          display: flex;
          margin-bottom: 6px;
        }
        .trk-gantt-header-spacer { width: 160px; flex-shrink: 0; }
        .trk-gantt-header-track {
          position: relative;
          flex: 1;
          height: 16px;
          border-bottom: 1px solid var(--border);
        }
        .trk-gantt-tick {
          position: absolute;
          transform: translateX(-50%);
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          color: var(--text-dim);
          white-space: nowrap;
        }
        .trk-gantt-body {
          max-height: 320px;
          overflow-y: auto;
        }
        .trk-gantt-group { margin-bottom: 10px; }
        .trk-gantt-project-label {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          letter-spacing: 0.5px;
          color: var(--accent);
          padding: 4px 0;
        }
        .trk-gantt-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 3px 0;
        }
        .trk-gantt-row-label {
          width: 160px;
          flex-shrink: 0;
          font-size: 11.5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @media (max-width: 640px) {
          .trk-gantt-header-spacer, .trk-gantt-row-label { width: 110px; }
        }
        .trk-gantt-track {
          position: relative;
          flex: 1;
          height: 16px;
          background: var(--panel-alt);
          border-radius: 4px;
        }
        .trk-gantt-bar {
          position: absolute;
          top: 0;
          height: 100%;
          border-radius: 4px;
          min-width: 4px;
          cursor: default;
        }
        .trk-gantt-today-line {
          position: absolute;
          top: -2px;
          bottom: -2px;
          width: 1px;
          background: var(--danger);
        }
        .trk-gantt-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }
        .trk-gantt-legend-item {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          color: var(--text-dim);
        }
        .trk-gantt-legend-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        .trk-modal-overlay {
          position: fixed;
          inset: 0;
          background: var(--overlay);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: 20px;
          animation: trk-fade-in 0.18s ease;
        }
        .trk-modal {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 22px;
          width: 100%;
          max-width: 440px;
          max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 18px 48px var(--shadow);
          animation: trk-pop-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        .trk-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .trk-modal-title { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 700; }
        .trk-field { margin-bottom: 12px; }
        .trk-field label {
          display: block;
          font-size: 11.5px;
          color: var(--text-dim);
          margin-bottom: 5px;
        }
        .trk-field input, .trk-field select, .trk-field textarea {
          width: 100%;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: var(--radius-md);
          padding: 8px 10px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
        }
        .trk-field input, .trk-field select { height: var(--control-h); padding: 0 10px; }
        .trk-field textarea { resize: vertical; min-height: 60px; }
        .trk-field-row { display: flex; gap: 10px; }
        .trk-field-row > div { flex: 1; min-width: 0; }
        @media (max-width: 480px) {
          .trk-field-row { flex-direction: column; gap: 0; }
        }
        .trk-modal-task {
          max-width: 620px;
          transition: max-width 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
        }
        .trk-modal-task-wide {
          max-width: 920px;
        }
        .trk-md-editor {
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          overflow: hidden;
          background: var(--panel-alt);
        }
        .trk-md-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 6px 8px;
          border-bottom: 1px solid var(--border);
          background: var(--panel);
        }
        .trk-md-tabs {
          display: flex;
          gap: 2px;
        }
        .trk-md-tab {
          display: flex;
          align-items: center;
          gap: 5px;
          border: none;
          background: none;
          color: var(--text-dim);
          font-size: 12px;
          font-family: 'Inter', sans-serif;
          padding: 5px 10px;
          border-radius: var(--radius-sm, 6px);
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease;
        }
        .trk-md-tab:hover { background: var(--panel-alt); color: var(--text); }
        .trk-md-tab.active { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent); font-weight: 600; }
        .trk-md-hint {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-dim);
          text-decoration: none;
          white-space: nowrap;
          padding: 4px 6px;
          border-radius: var(--radius-sm, 6px);
          transition: color 0.15s ease, background 0.15s ease;
        }
        .trk-md-hint:hover { color: var(--accent); background: var(--panel-alt); }
        .trk-md-panes {
          display: flex;
        }
        .trk-md-editor-split .trk-md-panes {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .trk-md-editor-split .trk-md-textarea {
          border-right: 1px solid var(--border);
        }
        .trk-md-textarea {
          flex: 1;
          width: 100%;
          min-height: 360px;
          resize: vertical;
          border: none;
          outline: none;
          background: transparent;
          color: var(--text);
          padding: 12px;
          font-size: 13px;
          font-family: 'JetBrains Mono', 'Space Mono', monospace;
          line-height: 1.55;
        }
        .trk-md-preview {
          flex: 1;
          min-height: 360px;
          max-height: 600px;
          overflow-y: auto;
          padding: 12px 16px;
          font-size: 13px;
          line-height: 1.55;
          color: var(--text);
        }
        .trk-md-preview-empty {
          color: var(--text-dim);
          font-style: italic;
          font-size: 12.5px;
        }
        .trk-md-preview h1, .trk-md-preview h2, .trk-md-preview h3 {
          font-family: 'Space Grotesk', sans-serif;
          margin: 0 0 8px;
          line-height: 1.3;
        }
        .trk-md-preview h1 { font-size: 19px; }
        .trk-md-preview h2 { font-size: 16.5px; }
        .trk-md-preview h3 { font-size: 14.5px; }
        .trk-md-preview p { margin: 0 0 10px; }
        .trk-md-preview ul, .trk-md-preview ol { margin: 0 0 10px; padding-left: 20px; }
        .trk-md-preview li { margin-bottom: 3px; }
        .trk-md-preview li > ul, .trk-md-preview li > ol { margin-top: 3px; margin-bottom: 0; }
        .trk-md-preview a { color: var(--accent); }
        .trk-md-preview code {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 4px;
          padding: 1px 5px;
          font-family: 'JetBrains Mono', 'Space Mono', monospace;
          font-size: 12px;
        }
        .trk-md-preview pre {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          padding: 10px 12px;
          overflow-x: auto;
          margin: 0 0 10px;
        }
        .trk-md-preview pre code { background: none; border: none; padding: 0; }
        .trk-md-preview blockquote {
          margin: 0 0 10px;
          padding: 4px 12px;
          border-left: 3px solid var(--accent);
          color: var(--text-dim);
        }
        .trk-md-preview hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
        .trk-md-preview img { max-width: 100%; border-radius: var(--radius-sm, 6px); }
        .trk-md-preview table { border-collapse: collapse; width: 100%; margin: 0 0 10px; font-size: 12.5px; }
        .trk-md-preview th, .trk-md-preview td { border: 1px solid var(--border); padding: 5px 8px; text-align: left; }
        .trk-md-preview p:last-child { margin-bottom: 0; }
        @media (max-width: 640px) {
          .trk-modal-task-wide { max-width: 620px; }
          .trk-md-editor-split .trk-md-panes { grid-template-columns: 1fr; }
          .trk-md-editor-split .trk-md-textarea { border-right: none; border-bottom: 1px solid var(--border); }
        }
        .trk-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 18px;
        }
        .trk-btn-secondary {
          height: var(--control-h);
          background: none;
          border: 1px solid var(--border);
          color: var(--text-dim);
          border-radius: var(--radius-md);
          padding: 0 14px;
          font-size: 13px;
          cursor: pointer;
        }
        .trk-btn-primary {
          height: var(--control-h);
          background: var(--accent);
          border: none;
          color: var(--accent-contrast);
          border-radius: var(--radius-md);
          padding: 0 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .trk-btn-danger {
          height: var(--control-h);
          background: var(--danger);
          border: none;
          color: #fff;
          border-radius: var(--radius-md);
          padding: 0 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .trk-modal-overlay-nested {
          background: var(--overlay);
          z-index: 60;
        }
        .trk-save-error {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--warn);
          margin-top: 10px;
        }
        .trk-loading {
          padding: 60px;
          text-align: center;
          color: var(--text-dim);
          font-size: 13px;
        }

        /* ── Tâches simples (3 états) ── */
        .trk-type-tag {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          font-size: 10px;
          font-weight: 600;
          color: #D6C13C;
          border: 1px solid color-mix(in srgb, #D6C13C 45%, transparent);
          background: color-mix(in srgb, #D6C13C 12%, transparent);
          padding: 1px 7px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .trk-type-switch { display: flex; gap: 6px; }
        .trk-type-switch button {
          flex: 1;
          height: var(--control-h);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--text-dim);
          border-radius: var(--radius-md);
          font-size: 12px;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s, background 0.15s;
        }
        .trk-type-switch button.active {
          border-color: var(--accent);
          color: var(--text);
          background: color-mix(in srgb, var(--accent) 12%, var(--panel-alt));
        }
        .trk-board-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          letter-spacing: 1.2px;
          color: var(--text-dim);
          margin: 14px 0 8px;
        }
        .trk-board-label:first-child { margin-top: 0; }
        .trk-task-row[draggable="true"] { cursor: grab; }
        .trk-task-row[draggable="true"]:active { cursor: grabbing; }

        /* ── Zone de focus ── */
        @keyframes trk-focus-spin { to { transform: rotate(360deg); } }
        @keyframes trk-focus-glow-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        @keyframes trk-focus-drop-in {
          0% { opacity: 0; transform: translateY(12px) scale(0.96); filter: blur(5px); }
          55% { opacity: 1; transform: translateY(-2px) scale(1.012); filter: blur(0); }
          100% { opacity: 1; transform: none; filter: none; }
        }
        @keyframes trk-focus-ripple {
          0% { opacity: 0.85; transform: scale(0.92); }
          100% { opacity: 0; transform: scale(1.1); }
        }
        @keyframes trk-focus-child-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes trk-focus-leave {
          0% { opacity: 1; transform: none; }
          25% { transform: scale(1.06); }
          100% { opacity: 0; transform: translateY(-34px) scale(0.8) rotate(3deg); }
        }
        @keyframes trk-focus-drop-pulse {
          0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent); }
          100% { box-shadow: 0 0 0 18px transparent; }
        }
        @keyframes trk-flame-flicker {
          0%, 100% { transform: scale(1) rotate(-4deg); opacity: 0.9; }
          30% { transform: scale(1.18) rotate(4deg); opacity: 1; }
          60% { transform: scale(0.94) rotate(-2deg); opacity: 0.85; }
        }
        @keyframes trk-smoke-rise {
          0% {
            opacity: 0;
            transform: translate(0, 14px) scale(0.35);
            filter: blur(3px);
          }
          18% { opacity: var(--peak, 0.45); }
          55% {
            opacity: calc(var(--peak, 0.45) * 0.55);
            transform: translate(calc(var(--sway, 10px) * 0.45), -58px) scale(1.4);
            filter: blur(6px);
          }
          100% {
            opacity: 0;
            transform: translate(var(--sway, 10px), -118px) scale(2.4);
            filter: blur(11px);
          }
        }
        @keyframes trk-focus-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
        @keyframes trk-focus-idle-pulse {
          0%, 100% { border-color: var(--border); }
          50% { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); }
        }
        .trk-focus-zone {
          position: fixed;
          right: 22px;
          bottom: 22px;
          z-index: 40;
          width: 310px;
          border-radius: 16px;
          transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .trk-focus-zone.over { transform: scale(1.04); }
        .trk-focus-zone.leaving .trk-focus-card {
          animation: trk-focus-leave 0.85s cubic-bezier(0.55, 0, 0.8, 0.4) forwards;
        }
        .trk-focus-zone.leaving .trk-focus-smoke {
          opacity: 0;
          transition: opacity 0.5s ease-out;
        }
        .trk-focus-shell {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          padding: 1.5px;
          background: var(--border);
          box-shadow: 0 10px 30px var(--shadow);
          transition: background 0.3s ease, box-shadow 0.3s ease;
        }
        .trk-focus-zone::after {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          border-radius: 16px;
          box-shadow: 0 0 18px 2px color-mix(in srgb, var(--accent) 22%, transparent),
            0 0 34px 8px color-mix(in srgb, var(--accent) 14%, transparent);
          opacity: 0;
          pointer-events: none;
          transition: opacity 1.1s cubic-bezier(0.45, 0, 0.55, 1);
        }
        .trk-focus-zone.occupied::after {
          animation: trk-focus-glow-pulse 4.8s cubic-bezier(0.37, 0, 0.63, 1) infinite;
        }
        .trk-focus-zone.leaving::after { animation: none; opacity: 0; }
        .trk-focus-zone.occupied .trk-focus-shell::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 340%;
          aspect-ratio: 1;
          margin: -170% 0 0 -170%;
          background: conic-gradient(from 0deg,
            transparent 0deg, transparent 185deg,
            color-mix(in srgb, var(--accent) 12%, transparent) 235deg,
            color-mix(in srgb, var(--accent) 45%, transparent) 275deg,
            var(--accent) 300deg, #E08A3C 322deg,
            var(--accent) 340deg,
            color-mix(in srgb, var(--accent) 35%, transparent) 352deg,
            transparent 360deg);
          animation: trk-focus-spin 3.6s linear infinite;
        }
        .trk-focus-zone.leaving .trk-focus-shell::before { background: var(--ok); animation: none; }
        .trk-focus-zone.over .trk-focus-shell {
          background: var(--accent);
          animation: trk-focus-drop-pulse 0.9s ease-out infinite;
        }
        .trk-focus-inner {
          position: relative;
          border-radius: 14.5px;
          background: var(--panel);
          padding: 14px;
        }
        .trk-focus-head {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          letter-spacing: 1.2px;
          color: var(--text-dim);
          margin-bottom: 9px;
        }
        .trk-focus-head > svg { color: var(--accent); flex-shrink: 0; }
        .trk-focus-help {
          position: relative;
          display: inline-flex;
          color: var(--text-dim);
          opacity: 0.65;
          cursor: help;
          outline: none;
          transition: opacity 0.25s ease, color 0.25s ease;
        }
        .trk-focus-help:hover, .trk-focus-help:focus-visible {
          opacity: 1;
          color: var(--accent);
        }
        .trk-focus-help-tip {
          position: absolute;
          top: calc(100% + 9px);
          left: 50%;
          z-index: 5;
          transform: translate(-50%, -4px) scale(0.96);
          width: 200px;
          padding: 8px 10px;
          border-radius: 9px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          box-shadow: 0 8px 24px var(--shadow);
          color: var(--text);
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 400;
          line-height: 1.45;
          letter-spacing: 0.2px;
          text-transform: none;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transition: opacity 0.3s cubic-bezier(0.25, 0.8, 0.35, 1),
            transform 0.3s cubic-bezier(0.25, 0.8, 0.35, 1),
            visibility 0s linear 0.3s;
        }
        .trk-focus-help-tip::after {
          content: "";
          position: absolute;
          bottom: 100%;
          left: 50%;
          margin-left: -5px;
          border: 5px solid transparent;
          border-bottom-color: var(--panel-alt);
        }
        .trk-focus-help:hover .trk-focus-help-tip,
        .trk-focus-help:focus-visible .trk-focus-help-tip {
          opacity: 1;
          visibility: visible;
          transform: translate(-50%, 0) scale(1);
          transition: opacity 0.3s cubic-bezier(0.25, 0.8, 0.35, 1) 0.1s,
            transform 0.3s cubic-bezier(0.25, 0.8, 0.35, 1) 0.1s,
            visibility 0s linear 0.1s;
        }
        .trk-focus-cooking {
          margin-left: auto;
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--warn);
          font-size: 9.5px;
          letter-spacing: 1px;
        }
        .trk-focus-flame {
          animation: trk-flame-flicker 0.9s ease-in-out infinite;
          transform-origin: 50% 90%;
        }
        .trk-focus-dots { display: inline-flex; gap: 2.5px; }
        .trk-focus-dots i {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: currentColor;
          animation: trk-focus-dot 1.2s ease-in-out infinite;
        }
        .trk-focus-dots i:nth-child(2) { animation-delay: 0.2s; }
        .trk-focus-dots i:nth-child(3) { animation-delay: 0.4s; }
        .trk-focus-card {
          position: relative;
          animation: trk-focus-drop-in 0.55s cubic-bezier(0.22, 1, 0.36, 1);
          transition: opacity 0.2s, filter 0.2s;
        }
        /* Onde d'atterrissage jouée une seule fois à l'arrivée d'une tâche
           (la carte est re-montée via sa key à chaque entrée). */
        .trk-focus-card::after {
          content: "";
          position: absolute;
          inset: -14px;
          border-radius: 14px;
          border: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
          opacity: 0;
          pointer-events: none;
          animation: trk-focus-ripple 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s;
        }
        .trk-focus-card .trk-focus-title { animation: trk-focus-child-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s backwards; }
        .trk-focus-card .trk-focus-meta { animation: trk-focus-child-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.16s backwards; }
        .trk-focus-card .trk-focus-actions { animation: trk-focus-child-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.24s backwards; }
        /* Drag de la carte hors de la zone : la carte s'estompe, le feu se met en veille. */
        .trk-focus-zone.drag-out .trk-focus-card {
          opacity: 0.3;
          filter: grayscale(0.5);
        }
        .trk-focus-zone.drag-out .trk-focus-smoke { opacity: 0; transition: opacity 0.2s; }
        .trk-focus-zone.drag-out::after { animation: none; opacity: 0; }
        .trk-focus-zone.drag-out .trk-focus-shell::before { animation-play-state: paused; opacity: 0.35; }
        /* Sort de la goutte reflété par la zone : verte = elle y reste,
           rouge = le lâcher la libère. */
        .trk-focus-zone.drag-home .trk-focus-shell {
          background: color-mix(in srgb, var(--ok) 60%, var(--border));
          box-shadow: 0 10px 30px var(--shadow),
            0 0 24px color-mix(in srgb, var(--ok) 30%, transparent);
        }
        .trk-focus-zone.drag-home .trk-focus-card { opacity: 0.55; filter: none; }
        .trk-focus-zone.drag-away .trk-focus-shell {
          background: color-mix(in srgb, var(--danger) 55%, var(--border));
          box-shadow: 0 10px 30px var(--shadow),
            0 0 20px color-mix(in srgb, var(--danger) 22%, transparent);
        }
        /* Goutte « liquid glass » (façon iOS) qui suit le curseur pendant le
           drag de la tâche focalisée. Trois couches pour éviter tout conflit
           de transform : .trk-focus-ghost = position (JS), -deform =
           étirement directionnel (JS), -body = verre + ondulation (CSS). */
        .trk-focus-ghost {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 120;
          pointer-events: none;
          will-change: transform;
          /* Couleur du halo selon le sort au lâcher :
             dans la zone = reste (ok), dehors = libérée (danger). */
          --ghost-glow: var(--ok);
        }
        .trk-focus-ghost.away { --ghost-glow: var(--danger); }
        .trk-focus-ghost.away .trk-focus-ghost-body > svg { color: var(--danger); }
        .trk-focus-ghost-deform {
          position: relative;
          width: 96px;
          height: 96px;
          margin: -48px 0 0 -48px;
          will-change: transform;
        }
        .trk-focus-ghost-body {
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          width: 100%;
          height: 100%;
          padding: 12px;
          border-radius: 50%;
          font-size: 10.5px;
          font-weight: 600;
          line-height: 1.25;
          text-align: center;
          color: var(--text);
          text-shadow: 0 1px 3px color-mix(in srgb, var(--bg) 55%, transparent);
          background: color-mix(in srgb, var(--panel) 22%, transparent);
          backdrop-filter: blur(16px) saturate(1.8) brightness(1.08);
          -webkit-backdrop-filter: blur(16px) saturate(1.8) brightness(1.08);
          box-shadow:
            0 14px 34px var(--shadow),
            0 0 22px color-mix(in srgb, var(--ghost-glow) 42%, transparent),
            0 0 48px color-mix(in srgb, var(--ghost-glow) 16%, transparent),
            inset 0 0 0 1px rgba(255, 255, 255, 0.14),
            inset 1.5px 2.5px 5px rgba(255, 255, 255, 0.5),
            inset -2px -4px 8px rgba(255, 255, 255, 0.16);
          transition: box-shadow 0.3s ease;
          animation: trk-ghost-blob 2.6s ease-in-out infinite;
        }
        .trk-focus-ghost-body > svg { color: var(--warn); flex-shrink: 0; }
        .trk-focus-ghost-body > span {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-wrap: anywhere;
        }
        /* Réfraction des bords : glints lumineux en haut-gauche / bas-droite. */
        .trk-focus-ghost-body::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          background:
            radial-gradient(130% 95% at 18% -10%, rgba(255, 255, 255, 0.38), transparent 42%),
            radial-gradient(130% 110% at 85% 120%, rgba(255, 255, 255, 0.22), transparent 46%);
        }
        /* Reflet spéculaire qui dérive lentement sur la surface. */
        .trk-focus-ghost-body::after {
          content: "";
          position: absolute;
          top: 2px;
          left: 8%;
          width: 34%;
          height: 40%;
          border-radius: 50%;
          pointer-events: none;
          background: radial-gradient(closest-side, rgba(255, 255, 255, 0.45), transparent);
          filter: blur(3px);
          animation: trk-ghost-glint 2.4s ease-in-out infinite;
        }
        /* Ondulation organique : la capsule respire comme une goutte posée. */
        @keyframes trk-ghost-blob {
          0%, 100% { border-radius: 55% 45% 52% 48% / 52% 58% 42% 48%; }
          33% { border-radius: 47% 53% 45% 55% / 58% 44% 56% 42%; }
          66% { border-radius: 53% 47% 57% 43% / 44% 52% 48% 56%; }
        }
        @keyframes trk-ghost-glint {
          0%, 100% { transform: translateX(0) scale(1); opacity: 0.9; }
          50% { transform: translateX(130%) scale(0.75, 0.9); opacity: 0.5; }
        }
        /* Au lâcher : la goutte s'écrase, éclabousse et s'évapore. */
        .trk-focus-ghost.pop .trk-focus-ghost-body {
          animation: trk-ghost-burst 0.45s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        @keyframes trk-ghost-burst {
          0% { opacity: 1; transform: scale(1); filter: blur(0); }
          30% { opacity: 0.9; transform: scale(1.12, 0.78); }
          100% { opacity: 0; transform: scale(1.4, 0.45); filter: blur(8px); }
        }
        .trk-focus-ghost-drops {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: none;
        }
        .trk-focus-ghost.pop .trk-focus-ghost-drops { display: block; }
        .trk-focus-ghost-drops i {
          position: absolute;
          left: 50%;
          top: 50%;
          width: var(--sz, 7px);
          height: var(--sz, 7px);
          margin: calc(var(--sz, 7px) / -2) 0 0 calc(var(--sz, 7px) / -2);
          border-radius: 50%;
          background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.2) 72%);
          animation: trk-ghost-splash 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .trk-focus-ghost-drops i:nth-child(1) { --dx: -44px; --dy: -26px; --sz: 7px; }
        .trk-focus-ghost-drops i:nth-child(2) { --dx: 40px;  --dy: -32px; --sz: 6px; }
        .trk-focus-ghost-drops i:nth-child(3) { --dx: -34px; --dy: 24px;  --sz: 5px; }
        .trk-focus-ghost-drops i:nth-child(4) { --dx: 48px;  --dy: 16px;  --sz: 8px; }
        .trk-focus-ghost-drops i:nth-child(5) { --dx: 4px;   --dy: -46px; --sz: 5px; }
        .trk-focus-ghost-drops i:nth-child(6) { --dx: -8px;  --dy: 38px;  --sz: 6px; }
        @keyframes trk-ghost-splash {
          0% { opacity: 0.95; transform: translate(0, 0) scale(1); }
          100% { opacity: 0; transform: translate(var(--dx), var(--dy)) scale(0.25); }
        }
        /* Anneau d'onde au point d'impact. */
        .trk-focus-ghost.pop .trk-focus-ghost-drops::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 72px;
          height: 72px;
          margin: -36px 0 0 -36px;
          border-radius: 50%;
          border: 1.5px solid rgba(255, 255, 255, 0.4);
          animation: trk-ghost-ring 0.5s ease-out forwards;
        }
        @keyframes trk-ghost-ring {
          from { opacity: 0.7; transform: scale(0.4); }
          to { opacity: 0; transform: scale(1.6); }
        }
        @media (prefers-reduced-motion: reduce) {
          .trk-focus-ghost-body,
          .trk-focus-ghost-body::after,
          .trk-focus-ghost-drops i { animation: none; }
          .trk-focus-ghost-body { border-radius: 999px; }
          .trk-focus-ghost.pop { display: none; }
        }
        .trk-focus-smoke {
          position: absolute;
          bottom: 100%;
          left: 10px;
          right: 10px;
          height: 130px;
          margin-bottom: -6px;
          pointer-events: none;
          -webkit-mask-image: linear-gradient(to top, black 0%, black 30%, transparent 96%);
          mask-image: linear-gradient(to top, black 0%, black 30%, transparent 96%);
        }
        .trk-focus-smoke i {
          position: absolute;
          bottom: 0;
          left: var(--x, 50%);
          width: var(--size, 15px);
          height: var(--size, 15px);
          margin-left: calc(var(--size, 15px) / -2);
          border-radius: 50%;
          background: radial-gradient(circle,
            color-mix(in srgb, var(--text-dim) 60%, transparent) 0%,
            color-mix(in srgb, var(--text-dim) 25%, transparent) 45%,
            transparent 72%);
          opacity: 0;
          animation: trk-smoke-rise var(--dur, 3.4s) cubic-bezier(0.3, 0.1, 0.4, 1) infinite;
          animation-delay: var(--delay, 0s);
        }
        .trk-focus-smoke i:nth-child(1) { --x: 12%; --size: 14px; --sway: -18px; --dur: 3.6s; --delay: 0s;    --peak: 0.38; }
        .trk-focus-smoke i:nth-child(2) { --x: 26%; --size: 19px; --sway: 14px;  --dur: 4.2s; --delay: 1.1s;  --peak: 0.46; }
        .trk-focus-smoke i:nth-child(3) { --x: 42%; --size: 12px; --sway: -10px; --dur: 3.2s; --delay: 2.2s;  --peak: 0.34; }
        .trk-focus-smoke i:nth-child(4) { --x: 55%; --size: 21px; --sway: 20px;  --dur: 4.6s; --delay: 0.6s;  --peak: 0.5; }
        .trk-focus-smoke i:nth-child(5) { --x: 70%; --size: 15px; --sway: -14px; --dur: 3.8s; --delay: 1.7s;  --peak: 0.4; }
        .trk-focus-smoke i:nth-child(6) { --x: 84%; --size: 18px; --sway: 12px;  --dur: 4.4s; --delay: 2.8s;  --peak: 0.44; }
        .trk-focus-smoke i:nth-child(7) { --x: 94%; --size: 13px; --sway: -20px; --dur: 3.4s; --delay: 0.9s;  --peak: 0.32; }
        .trk-focus-task-btn {
          display: block;
          width: 100%;
          text-align: left;
          background: none;
          border: none;
          color: inherit;
          font-family: inherit;
          padding: 0;
          margin: 0 0 10px;
          cursor: grab;
        }
        .trk-focus-task-btn:active { cursor: grabbing; }
        .trk-focus-task-btn:hover .trk-focus-title { color: var(--accent); }
        .trk-focus-title {
          margin: 0 0 8px;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          transition: color 0.15s;
        }
        .trk-focus-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 6px;
        }
        .trk-focus-timer {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          color: var(--text-dim);
          border: 1px solid var(--border);
          border-radius: 999px;
          padding: 1px 7px;
        }
        .trk-focus-reduce-btn { flex-shrink: 0; }
        .trk-focus-zone:not(.occupied) .trk-focus-reduce-btn { margin-left: auto; }
        .trk-focus-reduced { width: auto; }
        .trk-focus-mini {
          display: flex;
          align-items: center;
          gap: 7px;
          height: 46px;
          min-width: 46px;
          padding: 0 15px;
          border-radius: 999px;
          background: var(--panel);
          border: 1.5px solid var(--border);
          color: var(--text-dim);
          font-size: 12px;
          cursor: pointer;
          box-shadow: 0 10px 30px var(--shadow);
          transition: border-color 0.15s, color 0.15s;
        }
        .trk-focus-reduced.occupied .trk-focus-mini {
          border-color: color-mix(in srgb, var(--accent) 70%, var(--border));
          color: var(--text);
          animation: trk-focus-breathe 2.6s ease-in-out infinite;
        }
        .trk-focus-reduced.occupied .trk-focus-mini > svg { color: var(--warn); }
        .trk-focus-reduced.over .trk-focus-mini {
          border-color: var(--accent);
          animation: trk-focus-drop-pulse 0.9s ease-out infinite;
        }
        .trk-focus-actions { display: flex; align-items: center; gap: 6px; }
        .trk-focus-done-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          height: var(--control-h-sm);
          background: color-mix(in srgb, var(--ok) 16%, transparent);
          border: 1px solid color-mix(in srgb, var(--ok) 45%, transparent);
          color: var(--ok);
          border-radius: var(--radius-sm);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s;
        }
        .trk-focus-done-btn:hover { background: color-mix(in srgb, var(--ok) 28%, transparent); }
        .trk-focus-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 10px 6px 12px;
          border: 1.5px dashed var(--border);
          border-radius: 10px;
          text-align: center;
          animation: trk-focus-idle-pulse 3s ease-in-out infinite;
          transition: border-color 0.15s, background 0.15s;
        }
        .trk-focus-zone.over .trk-focus-empty {
          border-color: var(--accent);
          background: color-mix(in srgb, var(--accent) 8%, transparent);
        }
        .trk-focus-empty-ring {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px dashed var(--border);
          color: var(--text-dim);
          margin-bottom: 3px;
          transition: transform 0.15s, border-color 0.15s, color 0.15s;
        }
        .trk-focus-zone.over .trk-focus-empty-ring {
          border-color: var(--accent);
          color: var(--accent);
          transform: scale(1.18) rotate(8deg);
        }
        .trk-focus-empty p { margin: 0; font-size: 12.5px; font-weight: 600; }
        .trk-focus-empty span { font-size: 10.5px; color: var(--text-dim); }
        @media (max-width: 640px) {
          .trk-focus-zone { right: 12px; bottom: 12px; width: 250px; }
          .trk-focus-reduced { width: auto; }
        }
      `}</style>

      <TitleBar maximized={maximized} />

      <div className="trk-content">
      {loading ? (
        <div className="trk-loading">{t("loading")}</div>
      ) : (
        <>
          <div className="trk-header">
            <div className="trk-header-brand">
              <div className="trk-eyebrow">{t("eyebrow")}</div>
              <h1 className="trk-title">{t("app_title")}</h1>
            </div>
            <div className="trk-gauge-block">
              <Gauge value={globalProgress} />
              <div className="trk-gauge-caption">
                <strong>{doneOfTotal(t, lang, doneCount, tasks.length)}</strong>
                <span>{tasksTotalLabel(lang, tasks.length)}</span>
              </div>
            </div>
            <div className="trk-header-actions">
              <div className="trk-io-group">
                <button
                  type="button"
                  className="trk-io-btn"
                  onClick={importData}
                  disabled={ioBusy}
                  title={t("import_data")}
                >
                  <Upload size={14} /> {t("import_data")}
                </button>
                <button
                  type="button"
                  className="trk-io-btn"
                  onClick={exportData}
                  disabled={ioBusy}
                  title={t("export_data")}
                >
                  <Download size={14} /> {t("export_data")}
                </button>
              </div>
              <button
                type="button"
                className={"trk-theme-btn" + (celebrationsOn ? "" : " trk-celeb-off")}
                onClick={toggleCelebrations}
                title={celebrationsOn ? t("celebrations_disable") : t("celebrations_enable")}
                aria-label={celebrationsOn ? t("celebrations_disable") : t("celebrations_enable")}
                aria-pressed={celebrationsOn}
              >
                <PartyPopper size={14} />
              </button>
              <button
                type="button"
                className="trk-theme-btn"
                onClick={toggleTheme}
                title={theme === "dark" ? t("theme_light") : t("theme_dark")}
                aria-label={theme === "dark" ? t("theme_light") : t("theme_dark")}
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <LangSwitch />
            </div>
          </div>

          <div className="trk-layout">
            <aside className="trk-sidebar">
              <div className="trk-sidebar-title">
                {t("projects")}
                {filterProjects.length > 0 && <span className="trk-filter-count"> · {selectedCountLabel(lang, filterProjects.length)}</span>}
              </div>
              <button
                className={"trk-all-btn" + (filterProjects.length === 0 ? " active" : "")}
                onClick={() => setFilterProjects([])}
              >
                {allProjectsLabel(lang, tasks.length)}
              </button>
              <div className="trk-kanban-col-search trk-project-search">
                <Search size={11} color="var(--text-dim)" />
                <input
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder={t("col_search_placeholder")}
                />
                {projectSearch && (
                  <button type="button" className="trk-icon-btn" onClick={() => setProjectSearch("")} title={t("clear_selection")}>
                    <X size={11} />
                  </button>
                )}
              </div>
              <div className="trk-project-list">
              {pagedProjects.map((p) => (
                <div
                  key={p.name}
                  className={"trk-project-card" + (filterProjects.includes(p.name) ? " active" : "")}
                  style={{ "--project-color": projectColor(p.name) }}
                  onClick={() => renamingProject !== p.name && toggleFilterProject(p.name)}
                  title={t("toggle_project_filter")}
                >
                  {renamingProject === p.name ? (
                    <div className="trk-add-project-row" onClick={(e) => e.stopPropagation()}>
                      <input
                        className="trk-add-project-input"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmRenameProject();
                          if (e.key === "Escape") cancelRenameProject();
                        }}
                      />
                      <button className="trk-icon-btn" onClick={confirmRenameProject} title={t("save")} aria-label={t("save")}><Check size={15} /></button>
                      <button className="trk-icon-btn" onClick={cancelRenameProject} title={t("cancel")} aria-label={t("cancel")}><X size={15} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="trk-project-card-top">
                        <span className="trk-project-name">
                          <span className="trk-project-dot" style={{ background: projectColor(p.name) }} />
                          {p.name}
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span className="trk-project-count">{p.count}</span>
                          <button
                            className="trk-project-remove"
                            onClick={(e) => { e.stopPropagation(); startRenameProject(p.name); }}
                            title={t("rename_project")}
                          >
                            <Pencil size={12} />
                          </button>
                          {p.count === 0 && (
                            <button
                              className="trk-project-remove"
                              onClick={(e) => { e.stopPropagation(); removeProject(p.name); }}
                              title={t("remove_project")}
                            >
                              <X size={13} />
                            </button>
                          )}
                        </span>
                      </div>
                      <ProgressBar value={p.progress} />
                    </>
                  )}
                </div>
              ))}
              </div>
              {projectTotalPages > 1 && (
                <div className="trk-project-pager">
                  <Pagination compact page={projectPage} totalPages={projectTotalPages} onChange={setProjectPage} />
                </div>
              )}

              {addingProject ? (
                <div className="trk-add-project-row">
                  <input
                    className="trk-add-project-input"
                    autoFocus
                    placeholder={t("project_name_placeholder")}
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addProject()}
                  />
                  <button className="trk-icon-btn" onClick={addProject} title={t("add")} aria-label={t("add")}><Check size={15} /></button>
                  <button className="trk-icon-btn" onClick={() => setAddingProject(false)} title={t("cancel")} aria-label={t("cancel")}><X size={15} /></button>
                </div>
              ) : (
                <button className="trk-ghost-btn" onClick={() => setAddingProject(true)}>
                  <FolderPlus size={13} /> {t("new_project")}
                </button>
              )}
            </aside>

            <main className="trk-main">
              <div className="trk-toolbar">
                <div className="trk-search">
                  <Search size={14} color="var(--text-dim)" />
                  <input
                    placeholder={t("search_placeholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <StatusFilterDropdown
                  selected={filterStatuts}
                  onToggle={toggleFilterStatut}
                  onClear={() => setFilterStatuts([])}
                />
                <select className="trk-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="priorite">{t("sort_priority")}</option>
                  <option value="statut">{t("sort_status")}</option>
                  <option value="projet">{t("sort_project")}</option>
                  <option value="echeance">{t("sort_due")}</option>
                </select>
                <div className="trk-view-switch">
                  <button
                    type="button"
                    className={"trk-view-btn" + (viewMode === "list" ? " active" : "")}
                    onClick={() => setViewMode("list")}
                    title={t("view_list")}
                    aria-pressed={viewMode === "list"}
                  >
                    <List size={14} /> <span className="trk-view-label">{t("view_list")}</span>
                  </button>
                  <button
                    type="button"
                    className={"trk-view-btn" + (viewMode === "kanban" ? " active" : "")}
                    onClick={() => setViewMode("kanban")}
                    title={t("view_kanban")}
                    aria-pressed={viewMode === "kanban"}
                  >
                    <Columns3 size={14} /> <span className="trk-view-label">{t("view_kanban")}</span>
                  </button>
                </div>
                <button className="trk-add-btn" onClick={openNewTask}>
                  <Plus size={15} /> {t("new_task")}
                </button>
              </div>

              {viewMode === "kanban" ? (
                sortedTasks.length === 0 ? (
                  <EmptyState label={t("empty_task_list")} actionLabel={t("new_task")} onAction={openNewTask} />
                ) : (() => {
                  const standardTasks = sortedTasks.filter((tk) => !isSimpleTask(tk));
                  const simpleTasks = sortedTasks.filter(isSimpleTask);
                  const boardProps = {
                    onMove: moveTask,
                    onEdit: openEditTask,
                    onDelete: deleteTask,
                    confirmId: confirmDelete,
                    onAskDelete: setConfirmDelete,
                    onCancelDelete: () => setConfirmDelete(null),
                    liveMinutesFor,
                  };
                  return (
                    <>
                      {standardTasks.length > 0 && (
                        <>
                          {simpleTasks.length > 0 && (
                            <div className="trk-board-label">
                              <Columns3 size={11} /> {t("kanban_standard")}
                            </div>
                          )}
                          <KanbanBoard tasks={standardTasks} {...boardProps} />
                        </>
                      )}
                      {simpleTasks.length > 0 && (
                        <>
                          {standardTasks.length > 0 && (
                            <div className="trk-board-label">
                              <Zap size={11} /> {t("kanban_simple")}
                            </div>
                          )}
                          <KanbanBoard tasks={simpleTasks} statuses={SIMPLE_STATUSES} {...boardProps} />
                        </>
                      )}
                    </>
                  );
                })()
              ) : (
              <div className="trk-task-list">
                {sortedTasks.length === 0 && (
                  <EmptyState label={t("empty_task_list")} actionLabel={t("new_task")} onAction={openNewTask} />
                )}
                {pagedTasks.map((task) => {
                  const st = statusOf(task.statut);
                  const pr = prioOf(task.priorite);
                  const pc = projectColor(task.projet);
                  return (
                    <div
                      key={task.id}
                      className={"trk-task-row" + (isTaskDone(task) ? " done" : "")}
                      style={{ "--rail-color": pr.color }}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", task.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div className="trk-task-main">
                        <p className="trk-task-title">{task.titre}</p>
                        <div className="trk-task-meta">
                          <span className="trk-tag" style={{ "--pill-color": pc }}>{task.projet}</span>
                          {isSimpleTask(task) && (
                            <span className="trk-type-tag"><Zap size={10} /> {t("type_simple_tag")}</span>
                          )}
                          <span className="trk-prio-tag" style={{ "--pill-color": pr.color }}>
                            {task.priorite === "critique" && <AlertTriangle size={11} />}
                            {t(`prio_${pr.id}`)}
                          </span>
                          <span className="trk-status-pill" style={{ "--pill-color": st.color }}>
                            {t(`status_${st.id}`)}
                          </span>
                          {task.assigne && <span>{task.assigne}</span>}
                          {task.echeance && <span className="trk-mono">{task.echeance}</span>}
                          <div className="trk-timelog-wrap">
                            <button
                              type="button"
                              className={"trk-time-badge" + (liveMinutesFor(task) ? " has-time" : "")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTimeLogTaskId(timeLogTaskId === task.id ? null : task.id);
                              }}
                              title={t("record_time")}
                            >
                              <Clock size={11} /> {formatDuration(liveMinutesFor(task))}
                            </button>
                            {timeLogTaskId === task.id && (
                              <TimeLogPopover
                                task={task}
                                liveMinutes={liveMinutesFor(task)}
                                onAdd={(minutes, note) => addTimeLog(task.id, minutes, note)}
                                onEdit={(logId, minutes, note) => editTimeLog(task.id, logId, minutes, note)}
                                onDelete={(logId) => deleteTimeLog(task.id, logId)}
                                onClose={() => setTimeLogTaskId(null)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="trk-task-actions">
                        {confirmDelete === task.id ? (
                          <div className="trk-confirm">
                            <span className="trk-confirm-label">{t("delete_confirm")}</span>
                            <button className="trk-icon-btn trk-icon-danger" onClick={() => deleteTask(task.id)} title={t("confirm_delete_yes")} aria-label={t("confirm_delete_yes")}><Check size={14} /></button>
                            <button className="trk-icon-btn" onClick={() => setConfirmDelete(null)} title={t("cancel")} aria-label={t("cancel")}><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            <button className="trk-icon-btn" onClick={() => openEditTask(task)} title={t("edit_task")} aria-label={t("edit_task")}><Pencil size={14} /></button>
                            <button className="trk-icon-btn" onClick={() => setConfirmDelete(task.id)} title={t("remove")} aria-label={t("remove")}><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
                <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} />
              </div>
              )}
            </main>
          </div>

          <section className="trk-charts">
            <ChartCard
              title={t("chart_status_distribution")}
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
                    <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", fontSize: 12 }} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            />

            <ChartCard
              title={t("chart_project_progress")}
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
                    <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", fontSize: 12 }} labelStyle={{ color: "var(--text)" }} />
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
                    <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", fontSize: 12 }} labelStyle={{ color: "var(--text)" }} itemStyle={{ color: "var(--text)" }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {priorityDistribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            />

            <ChartCard
              title={t("chart_time_per_project")}
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
                      contentStyle={{ background: "var(--panel)", border: "1px solid var(--border)", fontSize: 12 }}
                      labelStyle={{ color: "var(--text)" }}
                      itemStyle={{ color: "var(--text)" }}
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
            empty={!tasks.some((tk) => tk.echeance)}
            emptyLabel={t("gantt_empty")}
            render={(height, focused) => (
              <div className={focused ? "trk-gantt-focus" : undefined}>
                <GanttChart tasks={tasks} projects={projects} />
              </div>
            )}
          />

          <FocusZone
            task={focusTask}
            leaving={focusLeaving}
            enterKey={focusEnterKey}
            startedAt={focusStartedAt}
            onDropTask={focusOnTask}
            onAdvance={advanceFocusTask}
            onRelease={releaseFocus}
            onEdit={openEditTask}
          />

          {saveError && (
            <div className="trk-save-error">
              <AlertTriangle size={13} /> {t("save_error")}
            </div>
          )}

          {pendingImport && (
            <div className="trk-modal-overlay" onClick={() => setPendingImport(null)}>
              <div className="trk-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("import_confirm_title")}>
                <div className="trk-modal-header">
                  <span className="trk-modal-title">{t("import_confirm_title")}</span>
                  <button className="trk-icon-btn" onClick={() => setPendingImport(null)}><X size={16} /></button>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 4px" }}>
                  {t("import_confirm_body")}
                </p>
                <p className="trk-mono" style={{ fontSize: 12, color: "var(--text)" }}>
                  {pendingImport.tasks.length} {t("import_task_count")} · {pendingImport.projects.length} {t("import_project_count")}
                </p>
                <div className="trk-modal-actions">
                  <button type="button" className="trk-btn-secondary" onClick={() => setPendingImport(null)}>{t("cancel")}</button>
                  <button type="button" className="trk-btn-primary" onClick={confirmImport}>{t("import_confirm_action")}</button>
                </div>
              </div>
            </div>
          )}

          {celebration && celebrationsOn && (
            <CelebrationOverlay
              variant={celebration.variant}
              legendary={celebration.legendary}
              title={t(celebration.legendary ? "celebrate_legendary_title" : `celebrate_title_${celebration.msg}`)}
              subtitle={t(celebration.legendary ? "celebrate_legendary_sub" : `celebrate_sub_${celebration.msg}`)}
              onDone={() => setCelebration(null)}
            />
          )}

          {miniCeleb && !celebration && celebrationsOn && (
            <MiniCelebration key={miniCeleb} onDone={() => setMiniCeleb(null)} />
          )}

          {toast && (
            <div
              className={"trk-toast" + (toast.type === "error" ? " trk-toast-error" : "")}
              role="status"
              aria-live="polite"
            >
              {toast.type === "error" ? <AlertTriangle size={14} /> : <Check size={14} />} {toast.text}
            </div>
          )}

          {modalOpen && editing && (
            <div className="trk-modal-overlay" onClick={requestCloseTaskModal}>
              <div
                className={"trk-modal trk-modal-task" + (descMode === "split" ? " trk-modal-task-wide" : "")}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={editing.id ? t("edit_task") : t("new_task")}
              >
                <div className="trk-modal-header">
                  <span className="trk-modal-title">{editing.id ? t("edit_task") : t("new_task")}</span>
                  <button className="trk-icon-btn" onClick={requestCloseTaskModal}><X size={16} /></button>
                </div>
                <form onSubmit={submitTask}>
                  <div className="trk-field">
                    <label>{t("field_title")}</label>
                    <input
                      autoFocus
                      value={editing.titre}
                      onChange={(e) => setEditing({ ...editing, titre: e.target.value })}
                      placeholder={t("title_placeholder")}
                      required
                    />
                  </div>
                  <div className="trk-field">
                    <label htmlFor="task-description">{t("field_description")}</label>
                    <MarkdownEditor
                      id="task-description"
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                      mode={descMode}
                      onModeChange={setDescMode}
                      placeholder={t("description_placeholder")}
                    />
                  </div>
                  {!editing.id && (
                    <div className="trk-field">
                      <label>{t("field_type")}</label>
                      <div className="trk-type-switch">
                        <button
                          type="button"
                          className={!isSimpleTask(editing) ? "active" : ""}
                          onClick={() => setEditing({ ...editing, type: "standard", statut: "analyser" })}
                          aria-pressed={!isSimpleTask(editing)}
                        >
                          <Columns3 size={13} /> {t("type_standard")}
                        </button>
                        <button
                          type="button"
                          className={isSimpleTask(editing) ? "active" : ""}
                          onClick={() => setEditing({ ...editing, type: "simple", statut: "todo" })}
                          aria-pressed={isSimpleTask(editing)}
                        >
                          <Zap size={13} /> {t("type_simple")}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="trk-field-row">
                    <div className="trk-field">
                      <label>{t("field_project")}</label>
                      <select
                        value={editing.projet}
                        onChange={(e) => setEditing({ ...editing, projet: e.target.value })}
                      >
                        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="trk-field">
                      <label>{t("field_priority")}</label>
                      <select
                        value={editing.priorite}
                        onChange={(e) => setEditing({ ...editing, priorite: e.target.value })}
                      >
                        {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{t(`prio_${p.id}`)}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="trk-field-row">
                    <div className="trk-field">
                      <label>{t("field_status")}</label>
                      <select
                        value={editing.statut}
                        onChange={(e) => setEditing({ ...editing, statut: e.target.value })}
                      >
                        {statusesForTask(editing).map((s) => <option key={s.id} value={s.id}>{t(`status_${s.id}`)}</option>)}
                      </select>
                    </div>
                    <div className="trk-field">
                      <label>{t("field_start")}</label>
                      <input
                        type="date"
                        value={editing.dateDebut || ""}
                        onChange={(e) => setEditing({ ...editing, dateDebut: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="trk-field-row">
                    <div className="trk-field">
                      <label>{t("field_due")}</label>
                      <input
                        type="date"
                        value={editing.echeance}
                        onChange={(e) => setEditing({ ...editing, echeance: e.target.value })}
                      />
                    </div>
                    <div className="trk-field">
                      <label>{t("field_assignee")}</label>
                      <input
                        value={editing.assigne}
                        onChange={(e) => setEditing({ ...editing, assigne: e.target.value })}
                        placeholder={t("assignee_placeholder")}
                      />
                    </div>
                  </div>
                  {editing.id ? (
                    <div className="trk-field">
                      <label>{t("field_time")}</label>
                      <TimeLogSection
                        task={editing}
                        liveMinutes={liveMinutesFor(editing)}
                        onAdd={addTimeLogToEditing}
                        onEdit={editTimeLogInEditing}
                        onDelete={deleteTimeLogFromEditing}
                      />
                    </div>
                  ) : (
                    <div className="trk-timelog-hint">{t("time_hint")}</div>
                  )}
                  <div className="trk-modal-actions">
                    <button type="button" className="trk-btn-secondary" onClick={requestCloseTaskModal}>{t("cancel")}</button>
                    <button type="submit" className="trk-btn-primary">{editing.id ? t("save") : t("add")}</button>
                  </div>
                </form>
              </div>

              {confirmCloseTask && (
                <div className="trk-modal-overlay trk-modal-overlay-nested" onClick={() => setConfirmCloseTask(false)}>
                  <div
                    className="trk-modal"
                    style={{ maxWidth: 380 }}
                    onClick={(e) => e.stopPropagation()}
                    role="alertdialog"
                    aria-modal="true"
                    aria-label={t("unsaved_changes_title")}
                  >
                    <div className="trk-modal-header">
                      <span className="trk-modal-title">{t("unsaved_changes_title")}</span>
                      <button className="trk-icon-btn" onClick={() => setConfirmCloseTask(false)}><X size={16} /></button>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 4px" }}>
                      {t("unsaved_changes_body")}
                    </p>
                    <div className="trk-modal-actions">
                      <button type="button" className="trk-btn-secondary" onClick={() => setConfirmCloseTask(false)}>{t("keep_editing")}</button>
                      <button type="button" className="trk-btn-danger" onClick={closeTaskModal}>{t("discard_changes")}</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
