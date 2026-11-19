import type { Task } from "./types";

const normalizeText = (s: unknown): string =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const taskHaystackCache = new WeakMap<Task, string>();

function getTaskHaystack(task: Task): string {
  const cached = taskHaystackCache.get(task);
  if (cached !== undefined) return cached;
  const normalized = normalizeText(
    [task.titre, task.description, task.projet, task.assigne].join(" ")
  );
  taskHaystackCache.set(task, normalized);
  return normalized;
}

/** Pré-normalise la requête une seule fois avant de filtrer une liste de tâches. */
export const compileSearchTerms = (query: string): string[] => {
  const q = normalizeText(query).trim();
  return q ? q.split(/\s+/) : [];
};

// Recherche "intelligente" : insensible aux accents/majuscules, chaque terme
// doit apparaître dans le texte.
export const matchesQuery = (text: unknown, query: string): boolean => {
  const terms = compileSearchTerms(query);
  if (terms.length === 0) return true;
  const haystack = normalizeText(text);
  return terms.every((term) => haystack.includes(term));
};

export const taskMatchesTerms = (task: Task, terms: string[]): boolean => {
  if (terms.length === 0) return true;
  const haystack = getTaskHaystack(task);
  for (let i = 0; i < terms.length; i++) {
    if (!haystack.includes(terms[i]!)) return false;
  }
  return true;
};

export const taskMatchesQuery = (task: Task, query: string): boolean =>
  taskMatchesTerms(task, compileSearchTerms(query));
