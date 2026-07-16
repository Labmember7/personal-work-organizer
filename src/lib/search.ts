import type { Task } from "./types";

const normalizeText = (s: unknown): string =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Recherche "intelligente" : insensible aux accents/majuscules, chaque terme
// doit apparaître dans le texte.
export const matchesQuery = (text: unknown, query: string): boolean => {
  const q = normalizeText(query).trim();
  if (!q) return true;
  const haystack = normalizeText(text);
  return q.split(/\s+/).every((term) => haystack.includes(term));
};

export const taskMatchesQuery = (task: Task, query: string): boolean =>
  matchesQuery([task.titre, task.description, task.projet, task.assigne].join(" "), query);
