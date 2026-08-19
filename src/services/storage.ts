// Accès au stockage : IPC Electron (window.storage / window.config) quand
// l'app tourne dans Electron, repli localStorage pour `vite dev` dans un
// navigateur. Toutes les fonctions sont asynchrones et tolérantes : une
// erreur de lecture rend null, une erreur d'écriture rend false.

import type { Project } from "../lib/types";

interface StorageBridge {
  get(key: string): Promise<{ key: string; value: unknown } | null>;
  set(key: string, value: unknown): Promise<{ key: string; ok: boolean }>;
  delete(key: string): Promise<{ key: string; deleted: boolean }>;
  list(prefix?: string): Promise<{ keys: string[]; prefix?: string }>;
}

interface ConfigBridge {
  getProjects(): Promise<Project[]>;
  setProjects(projects: Project[]): Promise<{ ok: boolean }>;
}

/**
 * Plugin découvert côté disque, non validé : `manifestJson` est le texte brut
 * du bloc `<script id="trk-plugin">`, la validation vit dans `lib/plugins/manifest.ts`.
 */
export interface RawPluginEntry {
  file: string;
  origin: "builtin" | "user";
  manifestJson: string | null;
  error?: string;
  /** Racine du dossier sur disque (v2) ; absente pour v1. */
  root?: string;
  /** Spec déclarative embarquée (v2, vue déclarative) ; absente sinon. */
  specJson?: string;
  /** Nature de l'entrée. */
  kind?: "html" | "folder";
}

interface PluginsBridge {
  list(): Promise<RawPluginEntry[]>;
  saveFile(payload: { name: string; mime: string; base64?: string; text?: string }): Promise<{ canceled: boolean; filePath?: string }>;
}

declare global {
  interface Window {
    storage?: StorageBridge;
    config?: ConfigBridge;
    dataIO?: {
      export(payload: unknown): Promise<{ canceled: boolean; filePath?: string }>;
      import(): Promise<{ canceled: boolean; filePath?: string; error?: string; data?: unknown }>;
    };
    images?: {
      save(buffer: ArrayBuffer): Promise<{ url: string; width: number; height: number }>;
      prune?(usedFiles: string[]): Promise<{ removed: number }>;
    };
    windowControls?: {
      minimize(): Promise<void>;
      toggleMaximize(): Promise<void>;
      close(): Promise<void>;
      isMaximized(): Promise<boolean>;
      onMaximizedChanged(cb: (isMaximized: boolean) => void): () => void;
    };
    plugins?: PluginsBridge;
  }
}

const LOCAL_PREFIX = "trk-store:";

const hasIpc = (): boolean => typeof window !== "undefined" && !!window.storage;

export async function loadValue<T>(key: string): Promise<T | null> {
  if (hasIpc()) {
    const res = await window.storage!.get(key);
    if (!res || res.value === null || res.value === undefined) return null;
    // Migration : les anciennes versions stockaient une chaîne JSON,
    // le store écrit désormais l'objet directement.
    return (typeof res.value === "string" ? JSON.parse(res.value) : res.value) as T;
  }
  const raw = localStorage.getItem(LOCAL_PREFIX + key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function saveValue(key: string, value: unknown): Promise<boolean> {
  if (hasIpc()) {
    const res = await window.storage!.set(key, value);
    return !!(res && res.ok);
  }
  localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value));
  return true;
}

/** Clés (sans préfixe) commençant par `prefix`. Utilisé pour énumérer `plugin-doc:<id>:`. */
export async function listKeys(prefix: string): Promise<string[]> {
  if (hasIpc()) {
    const res = await window.storage!.list(prefix);
    return Array.isArray(res?.keys) ? res.keys : [];
  }
  const target = LOCAL_PREFIX + prefix;
  const out: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(target)) out.push(key.slice(LOCAL_PREFIX.length));
  }
  return out;
}

export async function deleteValue(key: string): Promise<boolean> {
  if (hasIpc()) {
    const res = await window.storage!.delete(key);
    return !!(res && res.deleted);
  }
  localStorage.removeItem(LOCAL_PREFIX + key);
  return true;
}

// Supprime les images collées qui ne sont plus référencées par aucune
// description (voir images:prune dans main.js). Hors Electron : sans accès
// disque, il n'y a pas de fichier à nettoyer.
export async function pruneUnusedImages(usedFiles: string[]): Promise<void> {
  if (typeof window === "undefined" || !window.images?.prune) return;
  await window.images.prune(usedFiles);
}

// Liste de projets du fichier projects.config.json (éditable à la main).
export async function loadConfigProjects(): Promise<Project[] | null> {
  if (typeof window === "undefined" || !window.config) return null;
  const projects = await window.config.getProjects();
  return Array.isArray(projects) && projects.length ? projects : null;
}

export async function syncConfigProjects(projects: Project[]): Promise<void> {
  if (typeof window === "undefined" || !window.config) return;
  await window.config.setProjects(projects);
}
