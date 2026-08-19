// Découverte des plugins et export de fichiers plugin (JSON, PNG…).
//
// Deux chemins, comme le reste de `services/` : IPC Electron quand `window.plugins`
// existe, repli navigateur pour `npm run dev` (pas d'IPC, pas de CSP en dev).
// La validation du manifeste (schéma, apiVersion, capacités) est déléguée à
// `lib/plugins/manifest.ts` dans les deux cas : ce module ne fait que
// rassembler les fichiers bruts et construire les URL d'iframe.

import { extractManifestBlock, parseManifest } from "../lib/plugins/manifest";
import { parseManifestV2 } from "../lib/plugins/manifest2";
import { parseViewSpecText } from "../lib/plugins/viewSpec";
import type { PluginCapability, PluginManifest, PluginScopeKind, PluginSource } from "../lib/plugins/types";
import type { PluginLoadError } from "../lib/plugins/types";
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

/** Normalise un manifeste v2 (`trk.extension/2`) en `PluginManifest` v1. */
function normalizeV2Manifest(m: {
  id: string;
  version: string;
  name: PluginManifest["name"];
  description?: PluginManifest["description"];
  icon?: string;
  permissions?: string[];
  engines?: { api?: number };
  contributes?: { views?: Array<{ scopes?: PluginScopeKind[]; singleton?: boolean }> };
}): PluginManifest {
  const caps = (m.permissions ?? []) as PluginCapability[];
  const firstView = Array.isArray(m.contributes?.views) ? m.contributes!.views![0] : undefined;
  return {
    id: m.id,
    version: m.version,
    apiVersion: typeof m.engines?.api === "number" ? m.engines.api : 2,
    name: m.name,
    ...(m.description !== undefined ? { description: m.description } : {}),
    ...(typeof m.icon === "string" ? { icon: m.icon } : {}),
    capabilities: caps,
    ...(Array.isArray(firstView?.scopes) ? { scopes: firstView!.scopes! } : {}),
    ...(firstView?.singleton === true ? { singleton: true } : {}),
  };
}

/** Parse la spec déclarative embarquée (JSON ou YAML `.trkv`). */
function parseDeclarativeSpec(raw?: string): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const parsed = parseViewSpecText(raw);
  return parsed.ok ? (parsed.data as Record<string, unknown>) : undefined;
}

/**
 * Construit la liste des plugins utilisables à partir des fichiers bruts,
 * unifiée v1 (`.html`) + v2 (`manifest.json`). Un plugin `user` écrase un
 * `builtin` du même id : `candidates` doit être ordonné builtin -> user, la
 * dernière affectation dans la Map gagne.
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

    // Discrimination v1 / v2 sans heuristique : le champ `format` est la
    // seule source de vérité (cf. spec § 4).
    let format: 1 | 2 = 1;
    try {
      const raw = JSON.parse(entry.manifestJson) as { format?: string };
      if (raw && raw.format === "trk.extension/2") format = 2;
    } catch {
      // manifeste v1 non-JSON (ou HTML encapsulé) : on garde v1.
    }

    if (format === 2) {
      const result = parseManifestV2(entry.manifestJson);
      if (!result.ok) {
        errors.push({ file: entry.file, origin: entry.origin, reason: result.reason, detail: result.detail });
        continue;
      }
      byId.set(result.manifest.id, {
        manifest: normalizeV2Manifest(result.manifest),
        url: `app-plugin://${result.manifest.id}/`,
        origin: entry.origin,
        file: entry.file,
        format: 2,
        ...(entry.root ? { root: entry.root } : {}),
        ...(entry.specJson ? { declarative: parseDeclarativeSpec(entry.specJson) } : {}),
      });
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
      format: 1,
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
  for (const [modulePath, json] of Object.entries(manifests)) {
    const v2 = parseManifestV2(json as string);
    if (!v2.ok) continue;

    const contributes = v2.manifest.contributes;
    const view = contributes?.views?.find((v) => v.kind === "declarative");
    if (!view || typeof view.spec !== "string") continue;

    const dir = modulePath.slice(0, modulePath.lastIndexOf("/"));
    const raw = specs[`${dir}/${view.spec}`];
    if (typeof raw !== "string") continue;
    const spec = parseDeclarativeSpec(raw);

    out.push({
      manifest: normalizeV2Manifest(v2.manifest),
      url: "",
      origin: "builtin",
      file: `${v2.manifest.id}/manifest.json`,
      format: 2,
      root: dir,
      ...(spec ? { declarative: spec } : {}),
    });
  }
  return out;
}

export async function discoverPlugins(): Promise<{ plugins: PluginSource[]; errors: PluginLoadError[] }> {
  const declarative = discoverDeclarative();

  if (hasIpc()) {
    const raw = await window.plugins!.list();
    const found = buildFromCandidates(raw, (file) => `app-plugin://local/${file}`);
    // Déduplication : en dev, l'IPC (dossiers v2) et le repli `import.meta.glob`
    // découvrent le même plugin. L'IPC prime (racine réelle, CSP par hôte).
    const byId = new Map(found.plugins.map((p) => [p.manifest.id, p]));
    for (const d of declarative) {
      if (!byId.has(d.manifest.id)) byId.set(d.manifest.id, d);
    }
    return { plugins: [...byId.values()], errors: found.errors };
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
