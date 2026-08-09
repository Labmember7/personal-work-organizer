// Lecture et validation du manifeste d'un plugin.
//
// Le manifeste est embarqué dans le fichier HTML du plugin, ce qui garde le
// principe « un plugin = un fichier » : rien à déclarer ailleurs, il suffit de
// déposer le .html dans `plugins/`.
//
//   <script type="application/json" id="trk-plugin">
//     { "id": "mindmap", "version": "1.0.0", "apiVersion": 1, ... }
//   </script>
//
// La validation vit ici et NULLE PART ailleurs : le processus principal ne fait
// qu'extraire le bloc et le transmettre tel quel (cf. electron/plugins.js).

import {
  PLUGIN_API_VERSION, PLUGIN_CAPABILITIES,
  type LocalizedText, type PluginCapability, type PluginManifest, type PluginScopeKind,
} from "./types";

/** Balise qui porte le manifeste. Doit rester alignée avec electron/plugins.js. */
export const MANIFEST_TAG_ID = "trk-plugin";

const MANIFEST_RE =
  /<script[^>]*\bid=["']trk-plugin["'][^>]*>([\s\S]*?)<\/script>/i;

/** Extrait le texte JSON du manifeste, ou null si le bloc est absent. */
export function extractManifestBlock(html: string): string | null {
  const found = MANIFEST_RE.exec(html);
  if (!found) return null;
  const body = found[1];
  if (body === undefined) return null;
  const trimmed = body.trim();
  return trimmed ? trimmed : null;
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type ManifestResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; reason: "invalid-manifest" | "api-too-new"; detail: string };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// Un libellé est soit une chaîne, soit un dictionnaire { fr, en, … } dont on
// n'accepte que les valeurs texte (une valeur non-texte casserait l'affichage).
function readLocalized(value: unknown): LocalizedText | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [lang, text] of Object.entries(value)) {
    if (typeof text === "string" && text.trim()) out[lang] = text.trim();
  }
  return Object.keys(out).length ? out : null;
}

function readCapabilities(value: unknown): PluginCapability[] | null {
  if (!Array.isArray(value)) return null;
  const out: PluginCapability[] = [];
  for (const entry of value) {
    // Une capacité inconnue est ignorée plutôt que fatale : un plugin écrit
    // pour une version plus récente reste utilisable avec ce qu'on sait faire.
    if (typeof entry === "string" && (PLUGIN_CAPABILITIES as readonly string[]).includes(entry)) {
      const cap = entry as PluginCapability;
      if (!out.includes(cap)) out.push(cap);
    }
  }
  return out;
}

function readScopes(value: unknown): PluginScopeKind[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((s): s is PluginScopeKind => s === "global" || s === "project");
  return out.length ? [...new Set(out)] : undefined;
}

/** Valide le JSON d'un manifeste. Ne lève jamais : rend un résultat typé. */
export function parseManifest(json: string): ManifestResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, reason: "invalid-manifest", detail: "JSON illisible" };
  }
  if (!isRecord(raw)) return { ok: false, reason: "invalid-manifest", detail: "objet attendu" };

  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!ID_RE.test(id)) {
    return { ok: false, reason: "invalid-manifest", detail: "champ `id` absent ou invalide" };
  }

  const name = readLocalized(raw.name);
  if (!name) return { ok: false, reason: "invalid-manifest", detail: "champ `name` absent" };

  const apiVersion = typeof raw.apiVersion === "number" ? raw.apiVersion : NaN;
  if (!Number.isInteger(apiVersion) || apiVersion < 1) {
    return { ok: false, reason: "invalid-manifest", detail: "champ `apiVersion` absent ou invalide" };
  }
  // Un plugin écrit pour un protocole plus récent que l'app est refusé : mieux
  // vaut un message clair qu'un plugin à moitié fonctionnel.
  if (apiVersion > PLUGIN_API_VERSION) {
    return {
      ok: false,
      reason: "api-too-new",
      detail: `apiVersion ${apiVersion} > ${PLUGIN_API_VERSION}`,
    };
  }

  const capabilities = readCapabilities(raw.capabilities);
  if (!capabilities) {
    return { ok: false, reason: "invalid-manifest", detail: "champ `capabilities` absent" };
  }

  const description = readLocalized(raw.description);
  const scopes = readScopes(raw.scopes);

  const manifest: PluginManifest = {
    id,
    version: typeof raw.version === "string" && raw.version.trim() ? raw.version.trim() : "0.0.0",
    apiVersion,
    name,
    capabilities,
    ...(description ? { description } : {}),
    ...(typeof raw.icon === "string" && raw.icon.trim() ? { icon: raw.icon.trim() } : {}),
    ...(scopes ? { scopes } : {}),
    ...(raw.singleton === true ? { singleton: true } : {}),
  };
  return { ok: true, manifest };
}

/** Libellé du manifeste dans la langue courante, avec repli fr puis en. */
export function localized(text: LocalizedText | undefined, lang: string): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  return text[lang] ?? text.fr ?? text.en ?? Object.values(text).find(Boolean) ?? "";
}

/** Portées supportées par un plugin (les deux par défaut). */
export const scopesOf = (manifest: PluginManifest): PluginScopeKind[] =>
  manifest.scopes ?? ["global", "project"];

export const hasCapability = (manifest: PluginManifest, cap: PluginCapability): boolean =>
  manifest.capabilities.includes(cap);
