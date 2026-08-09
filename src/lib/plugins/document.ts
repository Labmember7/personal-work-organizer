// Enveloppe de document de plugin : clé de stockage, création, normalisation,
// application d'un patch. Pure logique, sans I/O — le stockage vit dans
// `services/plugins.ts` / `features/plugins/usePluginDocs.ts`.
//
// Seul `data` appartient au plugin ; tout le reste (id, portée, refs,
// horodatage) est géré ici de façon identique pour tous les plugins, ce qui
// évite de réécrire ce code à chaque nouveau plugin.

import { uid } from "../uid";
import { PLUGIN_DOC_SCHEMA, type EntityRef, type PluginDocPatch, type PluginDocScope, type PluginDocSummary, type PluginDocument } from "./types";

/** Préfixe commun à toutes les clés de document de plugin dans le store. */
export const DOC_KEY_PREFIX = "plugin-doc:";

export const docStorageKey = (pluginId: string, docId: string): string =>
  `${DOC_KEY_PREFIX}${pluginId}:${docId}`;

/** Inverse de `docStorageKey`. Rend `null` si la clé n'a pas la forme attendue. */
export function parseDocKey(key: string): { pluginId: string; docId: string } | null {
  if (!key.startsWith(DOC_KEY_PREFIX)) return null;
  const rest = key.slice(DOC_KEY_PREFIX.length);
  const sep = rest.indexOf(":");
  if (sep <= 0) return null;
  const pluginId = rest.slice(0, sep);
  const docId = rest.slice(sep + 1);
  if (!pluginId || !docId) return null;
  return { pluginId, docId };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Dédoublonne par (kind, id) : un même nœud peut référencer une tâche
// plusieurs fois dans un arbre, l'hôte n'a besoin de le savoir qu'une fois.
function normalizeRefs(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: EntityRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const kind = entry.kind;
    const id = entry.id;
    if ((kind !== "task" && kind !== "project") || typeof id !== "string" || !id) continue;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, id });
  }
  return out;
}

function normalizeScope(value: unknown): PluginDocScope {
  if (isRecord(value) && value.kind === "project" && typeof value.project === "string" && value.project) {
    return { kind: "project", project: value.project };
  }
  return { kind: "global" };
}

export interface CreateDocumentInput {
  pluginId: string;
  pluginVersion?: string;
  title: string;
  scope: PluginDocScope;
  dataVersion: number;
  data: unknown;
}

export function createDocument(input: CreateDocumentInput): PluginDocument {
  const now = new Date().toISOString();
  return {
    schema: PLUGIN_DOC_SCHEMA,
    pluginId: input.pluginId,
    ...(input.pluginVersion ? { pluginVersion: input.pluginVersion } : {}),
    dataVersion: input.dataVersion,
    id: uid(),
    title: input.title,
    scope: input.scope,
    refs: [],
    createdAt: now,
    updatedAt: now,
    data: input.data,
  };
}

/** Garde de type minimale : assez pour distinguer un document d'autre chose. */
export function isPluginDocument(v: unknown): v is PluginDocument {
  return (
    isRecord(v) &&
    v.schema === PLUGIN_DOC_SCHEMA &&
    typeof v.pluginId === "string" &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    isRecord(v.scope) &&
    Array.isArray(v.refs) &&
    typeof v.createdAt === "string" &&
    typeof v.updatedAt === "string" &&
    "data" in v
  );
}

/**
 * Répare un document potentiellement tronqué (stockage corrompu, ancienne
 * version). Refuse toute enveloppe qui appartient explicitement à un autre
 * plugin : un mélange de documents ne doit jamais être adopté silencieusement.
 */
export function normalizeDocument(raw: unknown, pluginId: string): PluginDocument | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.pluginId === "string" && raw.pluginId !== pluginId) return null;

  const now = new Date().toISOString();
  const createdAt = typeof raw.createdAt === "string" ? raw.createdAt : now;
  return {
    schema: PLUGIN_DOC_SCHEMA,
    pluginId,
    ...(typeof raw.pluginVersion === "string" ? { pluginVersion: raw.pluginVersion } : {}),
    dataVersion: typeof raw.dataVersion === "number" ? raw.dataVersion : 1,
    id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
    title: typeof raw.title === "string" ? raw.title : "",
    scope: normalizeScope(raw.scope),
    refs: normalizeRefs(raw.refs),
    createdAt,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    data: "data" in raw ? raw.data : null,
  };
}

/** Rend un nouveau document : `createdAt` conservé, `updatedAt` rafraîchi. */
export function applyPatch(doc: PluginDocument, patch: PluginDocPatch): PluginDocument {
  return {
    ...doc,
    data: patch.data,
    ...(patch.dataVersion !== undefined ? { dataVersion: patch.dataVersion } : {}),
    // Un titre vide n'écrase pas le titre existant : un plugin qui envoie un
    // patch sans y penser ne doit pas vider le nom du document affiché.
    ...(patch.title !== undefined && patch.title.trim() ? { title: patch.title.trim() } : {}),
    ...(patch.refs !== undefined ? { refs: normalizeRefs(patch.refs) } : {}),
    updatedAt: new Date().toISOString(),
  };
}

export const summaryOf = (doc: PluginDocument): PluginDocSummary => ({
  id: doc.id,
  pluginId: doc.pluginId,
  title: doc.title,
  scope: doc.scope,
  updatedAt: doc.updatedAt,
  refCount: doc.refs.length,
});

/** `project === null` sélectionne les documents globaux. */
export const docMatchesScope = (doc: PluginDocument, project: string | null): boolean =>
  project === null ? doc.scope.kind === "global" : doc.scope.kind === "project" && doc.scope.project === project;
