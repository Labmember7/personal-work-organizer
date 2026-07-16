export const STATUSES = [
  { id: "analyser", label: "À analyser", weight: 0, color: "#8B95A1" },
  { id: "implementer", label: "À implémenter", weight: 20, color: "#4C7EA8" },
  { id: "revue", label: "En revue", weight: 45, color: "#35A7A0" },
  { id: "integrer", label: "À intégrer", weight: 70, color: "#7CA855" },
  { id: "valider", label: "À valider", weight: 90, color: "#D6C13C" },
  { id: "termine", label: "Terminé", weight: 100, color: "#4CAF6D" },
];

// Statuts des tâches "simples" (3 états seulement).
export const SIMPLE_STATUSES = [
  { id: "todo", label: "À faire", weight: 0, color: "#8B95A1" },
  { id: "doing", label: "En cours", weight: 50, color: "#4C7EA8" },
  { id: "done", label: "Terminé", weight: 100, color: "#4CAF6D" },
];

export const ALL_STATUSES = [...STATUSES, ...SIMPLE_STATUSES];

export const isSimpleTask = (t) => t.type === "simple";
export const statusesForTask = (t) => (isSimpleTask(t) ? SIMPLE_STATUSES : STATUSES);
export const isDoneStatus = (id) => id === "termine" || id === "done";
export const isTaskDone = (t) => isDoneStatus(t.statut);

export const PRIORITIES = [
  { id: "critique", label: "Critique", color: "#D64545", order: 0 },
  { id: "haute", label: "Haute", color: "#E08A3C", order: 1 },
  { id: "moyenne", label: "Moyenne", color: "#D6C13C", order: 2 },
  { id: "basse", label: "Basse", color: "#4CAF6D", order: 3 },
];

export const PROJECT_COLOR_PALETTE = [
  "#4C7EA8", "#D6893C", "#7CA855", "#B15FC9",
  "#35A7A0", "#D6635C", "#C9A63E", "#5B8FD6",
  "#8B6CD9", "#4FAE8E", "#D65C8F", "#8FA83C",
];

export const uid = () =>
  (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random();

export const statusOf = (id) => ALL_STATUSES.find((s) => s.id === id) || STATUSES[0];
export const prioOf = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[2];

export const taskMinutes = (t) => (t.timeLogs || []).reduce((sum, l) => sum + l.minutes, 0);

// Temps logué + temps de la session de focus en cours (non encore pointée),
// pour un affichage qui s'incrémente en direct pendant le focus.
export const liveTaskMinutes = (t, focusId, focusStartedAt, now) =>
  taskMinutes(t) + (focusId && t.id === focusId && focusStartedAt ? focusMinutes(focusStartedAt, now) : 0);

// Journée de travail maximale : 8h. Le temps de focus est plafonné à ce
// quota pour chaque jour calendaire couvert par la session.
export const DAY_WORK_CAP_MINUTES = 8 * 60;

export const focusMinutes = (startMs, endMs, cap = DAY_WORK_CAP_MINUTES) => {
  if (!startMs || !endMs || endMs <= startMs) return 0;
  let total = 0;
  let cursor = new Date(startMs);
  const end = new Date(endMs);
  while (cursor < end) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const chunkEnd = dayEnd < end ? dayEnd : end;
    total += Math.min((chunkEnd - cursor) / 60000, cap);
    cursor = dayEnd;
  }
  return Math.floor(total);
};

export const formatDuration = (min) => {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export const parseDurationInput = (raw) => {
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

export const isValidBackupData = (data) =>
  !!data && Array.isArray(data.tasks) && Array.isArray(data.projects);

export const buildBackupPayload = (tasks, projects) => ({
  tasks,
  projects,
  exportedAt: new Date().toISOString(),
});

const normalizeText = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Recherche "intelligente" : insensible aux accents/majuscules, chaque terme
// doit apparaître dans le texte.
export const matchesQuery = (text, query) => {
  const q = normalizeText(query).trim();
  if (!q) return true;
  const haystack = normalizeText(text);
  return q.split(/\s+/).every((term) => haystack.includes(term));
};

export const taskMatchesQuery = (task, query) =>
  matchesQuery([task.titre, task.description, task.projet, task.assigne].join(" "), query);

export const projectColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_COLOR_PALETTE[Math.abs(hash) % PROJECT_COLOR_PALETTE.length];
};
