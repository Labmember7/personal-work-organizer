import type { Task } from "./types";

/** Total des minutes pointées sur la tâche. */
export const taskMinutes = (t: Task): number =>
  (t.timeLogs || []).reduce((sum, l) => sum + l.minutes, 0);

// Temps logué + temps de la session de focus en cours (non encore pointée),
// pour un affichage qui s'incrémente en direct pendant le focus.
export const liveTaskMinutes = (
  t: Task,
  focusId: string | null,
  focusStartedAt: number | null,
  now: number
): number =>
  taskMinutes(t) +
  (focusId && t.id === focusId && focusStartedAt ? focusMinutes(focusStartedAt, now) : 0);

// Journée de travail maximale : 8h. Le temps de focus est plafonné à ce
// quota pour chaque jour calendaire couvert par la session.
export const DAY_WORK_CAP_MINUTES = 8 * 60;

export const focusMinutes = (
  startMs: number | null,
  endMs: number | null,
  cap: number = DAY_WORK_CAP_MINUTES
): number => {
  if (!startMs || !endMs || endMs <= startMs) return 0;
  let total = 0;
  let cursor = new Date(startMs);
  const end = new Date(endMs);
  while (cursor < end) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const chunkEnd = dayEnd < end ? dayEnd : end;
    total += Math.min((chunkEnd.getTime() - cursor.getTime()) / 60000, cap);
    cursor = dayEnd;
  }
  return Math.floor(total);
};

/** 90 -> « 1h30 », 45 -> « 45m », 65 -> « 1h05 », 0 -> « 0m ». */
export const formatDuration = (min: number): string => {
  if (!min) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}m`;
};

/** Analyse « 1h30 », « 1:30 », « 1,5h », « 45m », « 90 » ; null si invalide. */
export const parseDurationInput = (raw: string): number | null => {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (m) return parseInt(m[1]!, 10) * 60 + parseInt(m[2]!, 10);
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d{1,2})\s*m?)?$/);
  if (m) {
    const h = parseFloat(m[1]!.replace(",", "."));
    const mins = m[2] ? parseInt(m[2], 10) : 0;
    return Math.round(h * 60) + mins;
  }
  m = s.match(/^(\d+)\s*m(?:in)?$/);
  if (m) return parseInt(m[1]!, 10);
  m = s.match(/^(\d+)$/);
  if (m) return parseInt(m[1]!, 10);
  return null;
};
