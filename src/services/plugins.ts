// Découverte des plugins et export de fichiers plugin (JSON, PNG…).
//
// Deux chemins, comme le reste de `services/` : IPC Electron quand `window.plugins`
// existe, repli navigateur pour `npm run dev` (pas d'IPC, pas de CSP en dev).
// La validation du manifeste (schéma, apiVersion, capacités) est déléguée à
// `lib/plugins/manifest.ts` dans les deux cas : ce module ne fait que
// rassembler les fichiers bruts et construire les URL d'iframe.

import { extractManifestBlock, parseManifest } from "../lib/plugins/manifest";
import type { PluginLoadError, PluginSource } from "../lib/plugins/types";
import type { RawPluginEntry } from "./storage";

// `tsconfig.json` désactive les types automatiques (`types: []`) : on
// n'augmente `ImportMeta` que de ce dont ce fichier a besoin, plutôt que
// d'importer toute la surface de `vite/client`.
declare global {
  interface ImportMeta {
    glob(pattern: string, options: { query?: string; import?: string; eager?: boolean }): Record<string, string>;
  }
}

const hasIpc = (): boolean => typeof window !== "undefined" && !!window.plugins;

function reasonFromRawError(error: string | undefined): PluginLoadError["reason"] {
  return error === "unreadable" ? "unreadable" : "no-manifest";
}

/**
 * Construit la liste des plugins utilisables à partir des fichiers bruts.
 * Un plugin `user` écrase un `builtin` du même id : `candidates` doit être
 * ordonné builtin -> user, la dernière affectation dans la Map gagne.
 */
function buildFromCandidates(
  candidates: RawPluginEntry[],
  urlFor: (file: string) => string,
): { plugins: PluginSource[]; errors: PluginLoadError[] } {
  const errors: PluginLoadError[] = [];
  const byId = new Map<string, PluginSource>();

  for (const entry of candidates) {
    if (entry.error || !entry.manifestJson) {
      errors.push({ file: entry.file, origin: entry.origin, reason: reasonFromRawError(entry.error) });
      continue;
    }
    const result = parseManifest(entry.manifestJson);
    if (!result.ok) {
      errors.push({ file: entry.file, origin: entry.origin, reason: result.reason, detail: result.detail });
      continue;
    }
    byId.set(result.manifest.id, {
      manifest: result.manifest,
      url: urlFor(entry.file),
      origin: entry.origin,
      file: entry.file,
    });
  }

  return { plugins: [...byId.values()], errors };
}

export async function discoverPlugins(): Promise<{ plugins: PluginSource[]; errors: PluginLoadError[] }> {
  if (hasIpc()) {
    const raw = await window.plugins!.list();
    return buildFromCandidates(raw, (file) => `app-plugin://local/${file}`);
  }

  // Hors Electron : Vite sert la racine du projet, `plugins/*.html` y est
  // accessible directement. Pas de dossier "user" distinct en dev.
  const modules = import.meta.glob("/plugins/*.html", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const candidates: RawPluginEntry[] = Object.entries(modules).map(([modulePath, html]) => {
    const file = modulePath.split("/").pop() ?? modulePath;
    const manifestJson = extractManifestBlock(html);
    return manifestJson ? { file, origin: "builtin", manifestJson } : { file, origin: "builtin", manifestJson: null, error: "no-manifest" };
  });
  return buildFromCandidates(candidates, (file) => `/plugins/${file}`);
}

export interface PluginFilePayload {
  name: string;
  mime: string;
  base64?: string;
  text?: string;
}

/** Exporte un fichier de plugin via le dialogue natif ; repli téléchargement navigateur en dev. */
export async function savePluginFile(payload: PluginFilePayload): Promise<{ canceled: boolean; filePath?: string }> {
  if (hasIpc()) return window.plugins!.saveFile(payload);

  const blob =
    payload.text !== undefined
      ? new Blob([payload.text], { type: payload.mime })
      : new Blob([Uint8Array.from(atob(payload.base64 ?? ""), (c) => c.charCodeAt(0))], { type: payload.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.name;
  a.click();
  URL.revokeObjectURL(url);
  return { canceled: false };
}
