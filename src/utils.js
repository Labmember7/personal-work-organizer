export const STATUSES = [
  { id: "analyser", label: "À analyser", weight: 0, color: "#8B95A1" },
  { id: "implementer", label: "À implémenter", weight: 20, color: "#4C7EA8" },
  { id: "revue", label: "En revue", weight: 45, color: "#35A7A0" },
  { id: "integrer", label: "À intégrer", weight: 70, color: "#7CA855" },
  { id: "valider", label: "À valider", weight: 90, color: "#D6C13C" },
  { id: "termine", label: "Terminé", weight: 100, color: "#4CAF6D" },
];

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

export const statusOf = (id) => STATUSES.find((s) => s.id === id) || STATUSES[0];
export const prioOf = (id) => PRIORITIES.find((p) => p.id === id) || PRIORITIES[2];

export const taskMinutes = (t) => (t.timeLogs || []).reduce((sum, l) => sum + l.minutes, 0);

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

export const projectColor = (name) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_COLOR_PALETTE[Math.abs(hash) % PROJECT_COLOR_PALETTE.length];
};
