import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import {
  Plus, X, Check, Trash2, Pencil, Search, ArrowUpDown,
  ChevronDown, FolderPlus, AlertTriangle, Minus, Copy, ChevronsUpDown, Clock,
} from "lucide-react";

const STATUSES = [
  { id: "analyser", label: "À analyser", weight: 0, color: "#8B95A1" },
  { id: "implementer", label: "À implémenter", weight: 20, color: "#4C7EA8" },
  { id: "revue", label: "En revue", weight: 45, color: "#35A7A0" },
  { id: "integrer", label: "À intégrer", weight: 70, color: "#7CA855" },
  { id: "valider", label: "À valider", weight: 90, color: "#D6C13C" },
  { id: "termine", label: "Terminé", weight: 100, color: "#4CAF6D" },
];

const PRIORITIES = [
  { id: "critique", label: "Critique", color: "#D64545", order: 0 },
  { id: "haute", label: "Haute", color: "#E08A3C", order: 1 },
  { id: "moyenne", label: "Moyenne", color: "#D6C13C", order: 2 },
  { id: "basse", label: "Basse", color: "#4CAF6D", order: 3 },
];

const DEFAULT_PROJECTS = [];
const STORAGE_KEY = "suivi-travaux-data";

const PROJECT_COLOR_PALETTE = [
  "#4C7EA8", "#D6893C", "#7CA855", "#B15FC9",
  "#35A7A0", "#D6635C", "#C9A63E", "#5B8FD6",
  "#8B6CD9", "#4FAE8E", "#D65C8F", "#8FA83C",
];

const uid = () =>
  (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();

const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
const prioOf = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[2];

const taskMinutes = (t) => (t.timeLogs || []).reduce((sum, l) => sum + l.minutes, 0);

const formatDuration = (min) => {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const parseDurationInput = (raw) => {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2})\s*m?)?$/);
  if (m) {
    const h = parseFloat(m[1].replace(",", "."));
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    return Math.round(h * 60) + mins;
  }
  m = s.match(/^(\d+)\s*m(?:in)?$/);
  if (m) return parseInt(m[1], 10);
  m = s.match(/^(\d+)$/);
  if (m) return parseInt(m[1], 10);
  return null;
};

const projectColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_COLOR_PALETTE[Math.abs(hash) % PROJECT_COLOR_PALETTE.length];
};

function Gauge({ value }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  const dash = C * (pct / 100);
  const color = pct < 35 ? "#D64545" : pct < 70 ? "#E08A3C" : "#4CAF6D";
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
              stroke="#2A323D" strokeWidth="1.5" />
          );
        })}
      </g>
      <circle cx="60" cy="60" r={R} fill="none" stroke="#1F2530" strokeWidth="9" />
      <circle
        cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.5s ease" }}
      />
      <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="700" fill="#E8EBEE"
        fontFamily="'Space Grotesk', sans-serif">
        {Math.round(pct)}%
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="8" fill="#8B95A1"
        fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
        AVANCEMENT
      </text>
    </svg>
  );
}

function ProgressBar({ value, height = 6 }) {
  const color = value < 35 ? "#D64545" : value < 70 ? "#E08A3C" : "#4CAF6D";
  return (
    <div className="trk-pbar" style={{ height }}>
      <div className="trk-pbar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

function TitleBar({ maximized }) {
  const hasControls = typeof window !== "undefined" && !!window.windowControls;

  if (!hasControls) return null;

  return (
    <div className="trk-titlebar">
      <div className="trk-titlebar-drag">
        <span className="trk-titlebar-title">Suivi des travaux</span>
      </div>
      <div className="trk-traffic-lights">
        <button
          className="trk-traffic-btn trk-traffic-minimize"
          onClick={() => window.windowControls.minimize()}
          title="Réduire"
        >
          <Minus size={8} strokeWidth={3} className="trk-traffic-glyph" />
        </button>
        <button
          className="trk-traffic-btn trk-traffic-maximize"
          onClick={() => window.windowControls.toggleMaximize()}
          title={maximized ? "Restaurer" : "Agrandir"}
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
          title="Fermer"
        >
          <X size={8} strokeWidth={3} className="trk-traffic-glyph" />
        </button>
      </div>
    </div>
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const parseDate = (s) => (s ? new Date(s + "T00:00:00") : null);
const fmtTick = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

function GanttChart({ tasks, projects }) {
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
      return { label: fmtTick(d), left: toPct(d) };
    });

    const todayLeft = toPct(today);

    return { groups, ticks, todayLeft };
  }, [tasks, projects]);

  if (!rows) {
    return <div className="trk-empty" style={{ padding: 20 }}>Pas encore de tâches avec une échéance</div>;
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
                      title={`${t.titre} — ${st.label} (${t.dateDebut || t.echeance} → ${t.echeance})`}
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
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StatusFilterDropdown({ selected, onToggle, onClear }) {
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

  const label = selected.length === 0 ? "Tous statuts" : `${selected.length} statut${selected.length > 1 ? "s" : ""}`;

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
          {STATUSES.map((s) => (
            <label key={s.id} className="trk-multiselect-item">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => onToggle(s.id)} />
              <span className="trk-multiselect-dot" style={{ background: s.color }} />
              {s.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="trk-multiselect-clear" onClick={onClear}>Effacer la sélection</button>
          )}
        </div>
      )}
    </div>
  );
}

function TimeLogPopover({ task, onAdd, onDelete, onClose }) {
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
  const total = taskMinutes(task);

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
        <span>Temps passé</span>
        <span>{formatDuration(total)}</span>
      </div>
      <form className="trk-timelog-add" onSubmit={submit}>
        <input
          className="trk-timelog-duration-input"
          placeholder="1h30"
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          autoFocus
        />
        <input
          className="trk-timelog-note-input"
          placeholder="Note (optionnel)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="trk-icon-btn" title="Ajouter">
          <Plus size={14} />
        </button>
      </form>
      {error && <div className="trk-timelog-error">Format non reconnu (ex : 1h30, 45m, 90)</div>}
      <div className="trk-timelog-list">
        {logs.length === 0 && <div className="trk-timelog-empty">Aucune entrée</div>}
        {[...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
          <div key={l.id} className="trk-timelog-entry">
            <span className="trk-timelog-entry-info">
              <strong>{formatDuration(l.minutes)}</strong> · {l.date}{l.note ? ` · ${l.note}` : ""}
            </span>
            <button className="trk-icon-btn" onClick={() => onDelete(l.id)} title="Supprimer">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeLogSection({ task, onAdd, onDelete }) {
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const logs = task.timeLogs || [];
  const total = taskMinutes(task);

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
        <span>Temps enregistré</span>
        <span>{formatDuration(total)}</span>
      </div>
      <div className="trk-timelog-add">
        <input
          className="trk-timelog-duration-input"
          placeholder="1h30"
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          onKeyDown={onEnter}
        />
        <input
          className="trk-timelog-note-input"
          placeholder="Note (optionnel)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onEnter}
        />
        <button type="button" className="trk-icon-btn" title="Ajouter" onClick={submit}>
          <Plus size={14} />
        </button>
      </div>
      {error && <div className="trk-timelog-error">Format non reconnu (ex : 1h30, 45m, 90)</div>}
      <div className="trk-timelog-list">
        {logs.length === 0 && <div className="trk-timelog-empty">Aucune entrée</div>}
        {[...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
          <div key={l.id} className="trk-timelog-entry">
            <span className="trk-timelog-entry-info">
              <strong>{formatDuration(l.minutes)}</strong> · {l.date}{l.note ? ` · ${l.note}` : ""}
            </span>
            <button type="button" className="trk-icon-btn" onClick={() => onDelete(l.id)} title="Supprimer">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function App() {
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
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [addingProject, setAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [renamingProject, setRenamingProject] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [timeLogTaskId, setTimeLogTaskId] = useState(null);

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

  const openNewTask = () => {
    setEditing({
      id: null,
      projet: (filterProjects.length === 1 ? filterProjects[0] : projects[0]) || "",
      titre: "",
      description: "",
      priorite: "moyenne",
      statut: "analyser",
      assigne: "",
      dateDebut: new Date().toISOString().slice(0, 10),
      echeance: "",
      timeLogs: [],
    });
    setModalOpen(true);
  };

  const openEditTask = (t) => {
    setEditing({ ...t });
    setModalOpen(true);
  };

  const submitTask = (e) => {
    e.preventDefault();
    if (!editing.titre.trim() || !editing.projet.trim()) return;
    if (editing.id) {
      saveTasks(tasks.map((t) => (t.id === editing.id ? editing : t)));
    } else {
      saveTasks([...tasks, { ...editing, id: uid() }]);
    }
    setModalOpen(false);
    setEditing(null);
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
        (!filterStatuts.length || filterStatuts.includes(t.statut)) &&
        (!search || t.titre.toLowerCase().includes(search.toLowerCase()))
    );
  }, [tasks, filterProjects, filterStatuts, search]);

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    arr.sort((a, b) => {
      if (sortBy === "priorite") return prioOf(a.priorite).order - prioOf(b.priorite).order;
      if (sortBy === "statut")
        return STATUSES.findIndex((s) => s.id === a.statut) - STATUSES.findIndex((s) => s.id === b.statut);
      if (sortBy === "projet") return a.projet.localeCompare(b.projet);
      if (sortBy === "echeance") return (a.echeance || "9999-99-99").localeCompare(b.echeance || "9999-99-99");
      return 0;
    });
    return arr;
  }, [filteredTasks, sortBy]);

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

  const statusDistribution = useMemo(
    () =>
      STATUSES.map((s) => ({
        name: s.label,
        value: tasks.filter((t) => t.statut === s.id).length,
        color: s.color,
      })).filter((d) => d.value > 0),
    [tasks]
  );

  const perProjectStacked = useMemo(() => {
    return projects.map((p) => {
      const row = { projet: p };
      STATUSES.forEach((s) => {
        row[s.label] = tasks.filter((t) => t.projet === p && t.statut === s.id).length;
      });
      return row;
    });
  }, [projects, tasks]);

  const projectTimeDistribution = useMemo(
    () =>
      projects.map((p) => ({
        projet: p,
        minutes: tasks.filter((t) => t.projet === p).reduce((sum, t) => sum + taskMinutes(t), 0),
      })),
    [projects, tasks]
  );

  const priorityDistribution = useMemo(
    () =>
      PRIORITIES.map((p) => ({
        name: p.label,
        value: tasks.filter((t) => t.priorite === p.id).length,
        fill: p.color,
      })),
    [tasks]
  );

  const doneCount = tasks.filter((t) => t.statut === "termine").length;

  return (
    <div className={"trk-app" + (maximized ? " trk-app-maximized" : "")}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');

        .trk-app {
          --bg: #10141A;
          --panel: #181E26;
          --panel-alt: #1D2430;
          --border: #2A323D;
          --text: #E8EBEE;
          --text-dim: #8B95A1;
          --accent: #35A7A0;
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
          transition: border-radius 0.15s ease;
        }
        .trk-app.trk-app-maximized {
          border-radius: 0;
          border: none;
        }
        .trk-app * { box-sizing: border-box; }
        .trk-mono { font-family: 'IBM Plex Mono', monospace; }
        .trk-display { font-family: 'Space Grotesk', sans-serif; }

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
          background: #0C0F14;
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

        .trk-content { padding: 28px; flex: 1; min-height: 0; overflow-y: auto; }

        .trk-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 24px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 20px;
          flex-wrap: wrap;
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

        .trk-layout {
          display: grid;
          grid-template-columns: 250px 1fr;
          gap: 20px;
          align-items: start;
        }
        @media (max-width: 860px) {
          .trk-layout { grid-template-columns: 1fr; }
        }

        .trk-sidebar {
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px;
        }
        .trk-sidebar-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 1px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }
        .trk-project-card {
          padding: 10px 10px;
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
          background: #0E1216;
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
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 7px 10px;
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
          background: var(--panel);
          border: 1px solid var(--border);
          color: var(--text);
          border-radius: 8px;
          padding: 7px 10px;
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
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
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
          background: var(--accent);
          color: #0E1216;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .trk-add-btn:hover { filter: brightness(1.08); }

        .trk-task-list { display: flex; flex-direction: column; gap: 8px; }
        .trk-task-row {
          display: flex;
          align-items: center;
          gap: 12px;
          background: var(--panel);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 12px 14px;
          border-left: 4px solid var(--rail-color, var(--border));
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
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          padding: 2px 7px;
          border-radius: 4px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
        }
        .trk-prio-tag {
          font-size: 10.5px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
        }
        .trk-status-pill {
          font-size: 10.5px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 500;
        }
        .trk-timelog-wrap { position: relative; display: inline-flex; }
        .trk-time-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          background: var(--panel-alt);
          border: 1px solid var(--border);
          color: var(--text-dim);
          font-size: 10.5px;
          font-family: 'IBM Plex Mono', monospace;
          padding: 2px 7px;
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
          box-shadow: 0 8px 24px rgba(0,0,0,0.35);
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
        .trk-timelog-add { display: flex; gap: 6px; margin-bottom: 6px; }
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
          color: #D64545;
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

        .trk-task-actions { display: flex; gap: 6px; flex-shrink: 0; }
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
        .trk-icon-btn:hover { background: var(--panel-alt); color: var(--text); }
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

        .trk-charts {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 16px;
          margin-top: 28px;
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
        .trk-chart-title {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 0.5px;
          color: var(--text-dim);
          margin-bottom: 10px;
        }

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
          background: #D64545;
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
          background: rgba(8,10,13,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 50;
          padding: 20px;
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
          border-radius: 7px;
          padding: 8px 10px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
        }
        .trk-field textarea { resize: vertical; min-height: 60px; }
        .trk-field-row { display: flex; gap: 10px; }
        .trk-field-row > div { flex: 1; }
        .trk-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 18px;
        }
        .trk-btn-secondary {
          background: none;
          border: 1px solid var(--border);
          color: var(--text-dim);
          border-radius: 7px;
          padding: 8px 14px;
          font-size: 13px;
          cursor: pointer;
        }
        .trk-btn-primary {
          background: var(--accent);
          border: none;
          color: #0E1216;
          border-radius: 7px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .trk-save-error {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #E08A3C;
          margin-top: 10px;
        }
        .trk-loading {
          padding: 60px;
          text-align: center;
          color: var(--text-dim);
          font-size: 13px;
        }
      `}</style>

      <TitleBar maximized={maximized} />

      <div className="trk-content">
      {loading ? (
        <div className="trk-loading">Chargement du suivi…</div>
      ) : (
        <>
          <div className="trk-header">
            <div>
              <div className="trk-eyebrow">CENTRE DE PILOTAGE</div>
              <h1 className="trk-title">Suivi des travaux par projet</h1>
            </div>
            <div className="trk-gauge-block">
              <Gauge value={globalProgress} />
              <div className="trk-gauge-caption">
                <strong>{doneCount}/{tasks.length} terminées</strong>
                <span>{tasks.length} tâche{tasks.length !== 1 ? "s" : ""} au total</span>
              </div>
            </div>
          </div>

          <div className="trk-layout">
            <aside className="trk-sidebar">
              <div className="trk-sidebar-title">
                PROJETS
                {filterProjects.length > 0 && <span className="trk-filter-count"> · {filterProjects.length} sélectionné{filterProjects.length > 1 ? "s" : ""}</span>}
              </div>
              <button
                className={"trk-all-btn" + (filterProjects.length === 0 ? " active" : "")}
                onClick={() => setFilterProjects([])}
              >
                Tous les projets ({tasks.length})
              </button>
              {projectProgress.map((p) => (
                <div
                  key={p.name}
                  className={"trk-project-card" + (filterProjects.includes(p.name) ? " active" : "")}
                  style={{ "--project-color": projectColor(p.name) }}
                  onClick={() => renamingProject !== p.name && toggleFilterProject(p.name)}
                  title="Cliquer pour ajouter/retirer ce projet du filtre"
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
                      <button className="trk-icon-btn" onClick={confirmRenameProject}><Check size={15} /></button>
                      <button className="trk-icon-btn" onClick={cancelRenameProject}><X size={15} /></button>
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
                            title="Renommer ce projet"
                          >
                            <Pencil size={12} />
                          </button>
                          {p.count === 0 && (
                            <button
                              className="trk-project-remove"
                              onClick={(e) => { e.stopPropagation(); removeProject(p.name); }}
                              title="Retirer ce projet"
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

              {addingProject ? (
                <div className="trk-add-project-row">
                  <input
                    className="trk-add-project-input"
                    autoFocus
                    placeholder="Nom du projet"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addProject()}
                  />
                  <button className="trk-icon-btn" onClick={addProject}><Check size={15} /></button>
                  <button className="trk-icon-btn" onClick={() => setAddingProject(false)}><X size={15} /></button>
                </div>
              ) : (
                <button className="trk-ghost-btn" onClick={() => setAddingProject(true)}>
                  <FolderPlus size={13} /> Nouveau projet
                </button>
              )}
            </aside>

            <main className="trk-main">
              <div className="trk-toolbar">
                <div className="trk-search">
                  <Search size={14} color="#8B95A1" />
                  <input
                    placeholder="Rechercher une tâche…"
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
                  <option value="priorite">Trier : priorité</option>
                  <option value="statut">Trier : statut</option>
                  <option value="projet">Trier : projet</option>
                  <option value="echeance">Trier : échéance</option>
                </select>
                <button className="trk-add-btn" onClick={openNewTask}>
                  <Plus size={15} /> Nouvelle tâche
                </button>
              </div>

              <div className="trk-task-list">
                {sortedTasks.length === 0 && (
                  <div className="trk-empty">
                    Aucune tâche ne correspond. Ajoutez-en une pour démarrer le suivi.
                  </div>
                )}
                {sortedTasks.map((t) => {
                  const st = statusOf(t.statut);
                  const pr = prioOf(t.priorite);
                  const pc = projectColor(t.projet);
                  return (
                    <div key={t.id} className="trk-task-row" style={{ "--rail-color": pr.color }}>
                      <div className="trk-task-main">
                        <p className="trk-task-title">{t.titre}</p>
                        <div className="trk-task-meta">
                          <span className="trk-tag" style={{ color: pc, background: pc + "22", borderColor: pc + "55" }}>{t.projet}</span>
                          <span className="trk-prio-tag" style={{ color: pr.color, background: pr.color + "22" }}>
                            {t.priorite === "critique" && <AlertTriangle size={11} style={{ verticalAlign: "-2px", marginRight: 3 }} />}
                            {pr.label}
                          </span>
                          <span className="trk-status-pill" style={{ color: st.color, background: st.color + "22" }}>
                            {st.label}
                          </span>
                          {t.assigne && <span>{t.assigne}</span>}
                          {t.echeance && <span className="trk-mono">{t.echeance}</span>}
                          <div className="trk-timelog-wrap">
                            <button
                              type="button"
                              className={"trk-time-badge" + (taskMinutes(t) ? " has-time" : "")}
                              onClick={(e) => {
                                e.stopPropagation();
                                setTimeLogTaskId(timeLogTaskId === t.id ? null : t.id);
                              }}
                              title="Enregistrer du temps"
                            >
                              <Clock size={11} /> {formatDuration(taskMinutes(t))}
                            </button>
                            {timeLogTaskId === t.id && (
                              <TimeLogPopover
                                task={t}
                                onAdd={(minutes, note) => addTimeLog(t.id, minutes, note)}
                                onDelete={(logId) => deleteTimeLog(t.id, logId)}
                                onClose={() => setTimeLogTaskId(null)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="trk-task-actions">
                        {confirmDelete === t.id ? (
                          <div className="trk-confirm">
                            <span className="trk-confirm-label">Supprimer ?</span>
                            <button className="trk-icon-btn" onClick={() => deleteTask(t.id)}><Check size={14} /></button>
                            <button className="trk-icon-btn" onClick={() => setConfirmDelete(null)}><X size={14} /></button>
                          </div>
                        ) : (
                          <>
                            <button className="trk-icon-btn" onClick={() => openEditTask(t)}><Pencil size={14} /></button>
                            <button className="trk-icon-btn" onClick={() => setConfirmDelete(t.id)}><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </main>
          </div>

          <section className="trk-charts">
            <div className="trk-chart-card">
              <div className="trk-chart-title">RÉPARTITION GLOBALE PAR STATUT</div>
              {statusDistribution.length === 0 ? (
                <div className="trk-empty" style={{ padding: 20 }}>Pas encore de données</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={statusDistribution} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {statusDistribution.map((d, i) => <Cell key={i} fill={d.color} stroke="none" />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#181E26", border: "1px solid #2A323D", fontSize: 12 }} labelStyle={{ color: "#E8EBEE" }} itemStyle={{ color: "#E8EBEE" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="trk-chart-card">
              <div className="trk-chart-title">AVANCEMENT PAR PROJET (PAR STATUT)</div>
              {tasks.length === 0 ? (
                <div className="trk-empty" style={{ padding: 20 }}>Pas encore de données</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={perProjectStacked} layout="vertical" margin={{ left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A323D" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#8B95A1", fontSize: 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="projet" tick={{ fill: "#E8EBEE", fontSize: 11 }} width={70} />
                    <Tooltip contentStyle={{ background: "#181E26", border: "1px solid #2A323D", fontSize: 12 }} labelStyle={{ color: "#E8EBEE" }} />
                    {STATUSES.map((s) => (
                      <Bar key={s.id} dataKey={s.label} stackId="a" fill={s.color} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="trk-chart-card">
              <div className="trk-chart-title">RÉPARTITION PAR PRIORITÉ</div>
              {tasks.length === 0 ? (
                <div className="trk-empty" style={{ padding: 20 }}>Pas encore de données</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={priorityDistribution} margin={{ left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A323D" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#8B95A1", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#8B95A1", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#181E26", border: "1px solid #2A323D", fontSize: 12 }} labelStyle={{ color: "#E8EBEE" }} itemStyle={{ color: "#E8EBEE" }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {priorityDistribution.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="trk-chart-card">
              <div className="trk-chart-title">TEMPS EFFECTIF PAR PROJET</div>
              {projectTimeDistribution.every((d) => d.minutes === 0) ? (
                <div className="trk-empty" style={{ padding: 20 }}>Pas encore de temps enregistré</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={projectTimeDistribution} layout="vertical" margin={{ left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A323D" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "#8B95A1", fontSize: 11 }}
                      tickFormatter={formatDuration}
                      allowDecimals={false}
                    />
                    <YAxis type="category" dataKey="projet" tick={{ fill: "#E8EBEE", fontSize: 11 }} width={70} />
                    <Tooltip
                      contentStyle={{ background: "#181E26", border: "1px solid #2A323D", fontSize: 12 }}
                      labelStyle={{ color: "#E8EBEE" }}
                      itemStyle={{ color: "#E8EBEE" }}
                      formatter={(value) => [formatDuration(value), "Temps"]}
                    />
                    <Bar dataKey="minutes" radius={[0, 4, 4, 0]}>
                      {projectTimeDistribution.map((d, i) => (
                        <Cell key={i} fill={projectColor(d.projet)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="trk-chart-card trk-gantt-card">
            <div className="trk-chart-title">ÉVOLUTION DES TÂCHES PAR PROJET (GANTT)</div>
            <GanttChart tasks={tasks} projects={projects} />
          </section>

          {saveError && (
            <div className="trk-save-error">
              <AlertTriangle size={13} /> La sauvegarde a échoué, tes dernières modifications ne sont peut-être pas enregistrées.
            </div>
          )}

          {modalOpen && editing && (
            <div className="trk-modal-overlay" onClick={() => setModalOpen(false)}>
              <div className="trk-modal" onClick={(e) => e.stopPropagation()}>
                <div className="trk-modal-header">
                  <span className="trk-modal-title">{editing.id ? "Modifier la tâche" : "Nouvelle tâche"}</span>
                  <button className="trk-icon-btn" onClick={() => setModalOpen(false)}><X size={16} /></button>
                </div>
                <form onSubmit={submitTask}>
                  <div className="trk-field">
                    <label>Titre</label>
                    <input
                      autoFocus
                      value={editing.titre}
                      onChange={(e) => setEditing({ ...editing, titre: e.target.value })}
                      placeholder="Ex : Corriger la numérotation des slides"
                      required
                    />
                  </div>
                  <div className="trk-field">
                    <label>Description (optionnel)</label>
                    <textarea
                      value={editing.description}
                      onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                    />
                  </div>
                  <div className="trk-field-row">
                    <div className="trk-field">
                      <label>Projet</label>
                      <select
                        value={editing.projet}
                        onChange={(e) => setEditing({ ...editing, projet: e.target.value })}
                      >
                        {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="trk-field">
                      <label>Priorité</label>
                      <select
                        value={editing.priorite}
                        onChange={(e) => setEditing({ ...editing, priorite: e.target.value })}
                      >
                        {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="trk-field-row">
                    <div className="trk-field">
                      <label>Statut</label>
                      <select
                        value={editing.statut}
                        onChange={(e) => setEditing({ ...editing, statut: e.target.value })}
                      >
                        {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="trk-field">
                      <label>Début (optionnel)</label>
                      <input
                        type="date"
                        value={editing.dateDebut || ""}
                        onChange={(e) => setEditing({ ...editing, dateDebut: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="trk-field-row">
                    <div className="trk-field">
                      <label>Échéance (optionnel)</label>
                      <input
                        type="date"
                        value={editing.echeance}
                        onChange={(e) => setEditing({ ...editing, echeance: e.target.value })}
                      />
                    </div>
                    <div className="trk-field">
                      <label>Assigné à (optionnel)</label>
                      <input
                        value={editing.assigne}
                        onChange={(e) => setEditing({ ...editing, assigne: e.target.value })}
                        placeholder="Nom de la personne"
                      />
                    </div>
                  </div>
                  {editing.id ? (
                    <div className="trk-field">
                      <label>Temps</label>
                      <TimeLogSection
                        task={editing}
                        onAdd={addTimeLogToEditing}
                        onDelete={deleteTimeLogFromEditing}
                      />
                    </div>
                  ) : (
                    <div className="trk-timelog-hint">Le suivi du temps sera disponible une fois la tâche ajoutée.</div>
                  )}
                  <div className="trk-modal-actions">
                    <button type="button" className="trk-btn-secondary" onClick={() => setModalOpen(false)}>Annuler</button>
                    <button type="submit" className="trk-btn-primary">{editing.id ? "Enregistrer" : "Ajouter"}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
