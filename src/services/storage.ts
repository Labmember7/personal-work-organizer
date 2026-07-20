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
    };
    windowControls?: {
      minimize(): Promise<void>;
      toggleMaximize(): Promise<void>;
      close(): Promise<void>;
      isMaximized(): Promise<boolean>;
      onMaximizedChanged(cb: (isMaximized: boolean) => void): () => void;
    };
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
