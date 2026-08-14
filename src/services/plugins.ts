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

/**
 * PoC du format `trk.extension/2` : un plugin est un dossier `plugins/<id>/`
 * avec un `manifest.json`. Seules les vues déclaratives sont gérées ici — elles
 * n'ont besoin d'aucune iframe, d'aucune origine et d'aucun protocole, donc
 * d'aucune modification du processus principal.
 *
 * Raccourci assumé de la démonstration : `import.meta.glob` embarque le contenu
 * des fichiers au build, ce qui rend la démo visible aussi dans l'app packagée.
 * La découverte réellement dynamique (déposer un dossier à côté de
 * l'exécutable) demande d'étendre l'IPC `plugins:list` aux dossiers.
 */
function discoverDeclarative(): PluginSource[] {
  const manifests = import.meta.glob("/plugins/*/manifest.json", { query: "?raw", import: "default", eager: true });
  const specs = import.meta.glob("/plugins/*/views/*.trkv", { query: "?raw", import: "default", eager: true });

  const out: PluginSource[] = [];
  for (const [path, json] of Object.entries(manifests)) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(json) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (manifest.format !== "trk.extension/2" || typeof manifest.id !== "string") continue;

    const contributes = manifest.contributes as { views?: Record<string, unknown>[] } | undefined;
    const view = contributes?.views?.find((v) => v.kind === "declarative");
    if (!view || typeof view.spec !== "string") continue;

    const dir = path.slice(0, path.lastIndexOf("/"));
    const raw = specs[`${dir}/${view.spec}`];
    if (!raw) continue;
    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }

    out.push({
      manifest: {
        id: manifest.id,
        version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
        apiVersion: 1,
        name: (manifest.name ?? manifest.id) as PluginSource["manifest"]["name"],
        capabilities: ["tasks:read"],
        ...(typeof manifest.icon === "string" ? { icon: manifest.icon } : {}),
      },
      url: "",
      origin: "builtin",
      file: `${manifest.id}/manifest.json`,
      declarative: spec,
    });
  }
  return out;
}

export async function discoverPlugins(): Promise<{ plugins: PluginSource[]; errors: PluginLoadError[] }> {
  const declarative = discoverDeclarative();

  if (hasIpc()) {
    const raw = await window.plugins!.list();
    const found = buildFromCandidates(raw, (file) => `app-plugin://local/${file}`);
    return { plugins: [...found.plugins, ...declarative], errors: found.errors };
  }

  // Hors Electron : Vite sert la racine du projet, `plugins/*.html` y est
  // accessible directement. Pas de dossier "user" distinct en dev.
  const modules = import.meta.glob("/plugins/*.html", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const candidates: RawPluginEntry[] = Object.entries(modules).map(([modulePath, html]) => {
    const file = modulePath.split("/").pop() ?? modulePath;
    const manifestJson = extractManifestBlock(html);
    return manifestJson ? { file, origin: "builtin", manifestJson } : { file, origin: "builtin", manifestJson: null, error: "no-manifest" };
  });
  const found = buildFromCandidates(candidates, (file) => `/plugins/${file}`);
  return { plugins: [...found.plugins, ...declarative], errors: found.errors };
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
