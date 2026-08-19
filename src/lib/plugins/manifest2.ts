// Validation du manifeste d'un plugin `trk.extension/2` (PLUGIN_FORMAT_V2.md § 4).
//
// Source de verite pour le format v2 : validation structurelle, grammaire d'`id`
// et `publisher`, `engines.api` (refuse si trop recent), `engines.app` (plage
// semver comparee a package.json#version), permissions (inconnue ignoree),
// `contributes` (chaque section), et analyse statique de toute expression `trkx`
// declaree (commands.when, taskColumns.value/tone). Ne leve jamais.

import type { LocalizedText } from "./types";
import type { Diagnostic } from "./expr";
import { SCOPE } from "./expr";
import { analyze as exprAnalyze, parse as exprParse } from "./trkx";

/** api maximum que l'hote comprend actuellement. */
export const PLUGIN_API_MAX = 2;

/** Permissions connues du format v2. Une permission inconnue est ignoree. */
export const PLUGIN_PERMISSIONS_V2 = [
  "doc",
  "tasks:read",
  "task:reveal",
  "file:save",
  "toast",
  "fullscreen",
  "debug",
  "commands",
  "settings",
  "columns",
  "panels",
  "state",
] as const;

export type PluginPermissionV2 = (typeof PLUGIN_PERMISSIONS_V2)[number];

export type ViewKind = "declarative" | "app";
export type SettingType = "enum" | "number" | "boolean" | "string";

export interface DocTypeContrib {
  id: string;
  dataVersion: number;
  migrations?: string;
}

export interface ViewContrib {
  id: string;
  title?: LocalizedText;
  icon?: string;
  kind: ViewKind;
  spec?: string;
  entry?: string;
  docType?: string;
  scopes?: Array<"global" | "project">;
  singleton?: boolean;
}

export interface CommandContrib {
  id: string;
  title?: LocalizedText;
  icon?: string;
  when?: string;
}

export interface TaskColumnContrib {
  id: string;
  label?: LocalizedText;
  value: string;
  as?: string;
  width?: string;
  tone?: string;
}

export interface TaskPanelContrib {
  id: string;
  title?: LocalizedText;
  kind: ViewKind;
  spec?: string;
  entry?: string;
}

export interface SettingDef {
  type: SettingType;
  values?: string[];
  default?: unknown;
  min?: number;
  max?: number;
  label?: LocalizedText;
}

export interface Contributes {
  docTypes?: DocTypeContrib[];
  views?: ViewContrib[];
  commands?: CommandContrib[];
  taskColumns?: TaskColumnContrib[];
  taskPanels?: TaskPanelContrib[];
  settings?: Record<string, SettingDef>;
}

export interface PluginManifestV2 {
  format: "trk.extension/2";
  id: string;
  version: string;
  publisher?: string;
  license?: string;
  homepage?: string;
  engines: { api: number; app?: string };
  name: LocalizedText;
  description?: LocalizedText;
  icon?: string;
  categories?: string[];
  keywords?: string[];
  permissions: PluginPermissionV2[];
  locales?: { dir?: string; default?: string };
  contributes?: Contributes;
}

export type ManifestV2Error =
  | "invalid-json"
  | "not-v2"
  | "invalid-manifest"
  | "api-too-new"
  | "engine-mismatch";

export type ManifestV2Result =
  | { ok: true; manifest: PluginManifestV2 }
  | { ok: false; reason: ManifestV2Error; detail: string; diagnostics?: Diagnostic[] };

const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isStr = (v: unknown): v is string => typeof v === "string";

function readLocalized(value: unknown): LocalizedText | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [lang, text] of Object.entries(value)) {
    if (typeof text === "string" && text.trim()) out[lang] = text.trim();
  }
  return Object.keys(out).length ? out : null;
}

/** Valide une expression trkx dans une portee donnee. Vide = OK. */
function checkExpr(source: string | undefined, scope: Set<string>): Diagnostic[] {
  if (!source || !isStr(source)) return [];
  const parsed = exprParse(source);
  if (!parsed) return [{ code: "E_PARSE", message: `expression invalide : ${source}`, offset: 0, length: source.length }];
  return exprAnalyze(parsed, scope);
}

// ── Semver (engines.app) ────────────────────────────────────────────────────

function coerce(v: string): [number, number, number] | null {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(v.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

function cmpVer(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i]! < b[i]!) return -1;
    if (a[i]! > b[i]!) return 1;
  }
  return 0;
}

/** Verifie qu'une version satisfait une plage semver (>=, <=, >, <, =, ^, ~, ||). */
export function satisfiesRange(range: string, version: string): boolean {
  const target = coerce(version);
  if (!target) return false;
  const clauses = range.split("||").map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const comparators = clause.split(/\s+/).filter(Boolean);
    let ok = true;
    for (const comp of comparators) {
      const m = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(comp)!;
      const op = m[1] ?? "=";
      const ver = coerce(m[2]!);
      if (!ver) {
        ok = false;
        break;
      }
      let sat = false;
      if (op === ">=") sat = cmpVer(target, ver) >= 0;
      else if (op === "<=") sat = cmpVer(target, ver) <= 0;
      else if (op === ">") sat = cmpVer(target, ver) > 0;
      else if (op === "<") sat = cmpVer(target, ver) < 0;
      else if (op === "=") sat = cmpVer(target, ver) === 0;
      else if (op === "^") sat = cmpVer(target, ver) >= 0 && cmpVer(target, [ver[0]! + 1, 0, 0]) < 0;
      else if (op === "~") sat = cmpVer(target, ver) >= 0 && cmpVer(target, [ver[0]!, ver[1]! + 1, 0]) < 0;
      else sat = cmpVer(target, ver) === 0;
      if (!sat) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

// ── Validation ──────────────────────────────────────────────────────────────

export function parseManifestV2(json: string, opts?: { appVersion?: string }): ManifestV2Result {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, reason: "invalid-json", detail: "JSON illisible" };
  }
  if (!isRecord(raw)) return { ok: false, reason: "invalid-manifest", detail: "objet attendu" };
  if (raw.format !== "trk.extension/2") {
    return { ok: false, reason: "not-v2", detail: `format=${String(raw.format)}` };
  }

  const diagnostics: Diagnostic[] = [];

  const id = isStr(raw.id) ? raw.id.trim() : "";
  if (!ID_RE.test(id)) {
    return { ok: false, reason: "invalid-manifest", detail: "champ id absent ou invalide" };
  }

  const version = isStr(raw.version) && raw.version.trim() ? raw.version.trim() : "";
  if (!version) return { ok: false, reason: "invalid-manifest", detail: "champ version absent" };

  if (raw.publisher !== undefined) {
    const pub = isStr(raw.publisher) ? raw.publisher.trim() : "";
    if (!ID_RE.test(pub)) return { ok: false, reason: "invalid-manifest", detail: "publisher invalide" };
  }

  const engines = isRecord(raw.engines) ? raw.engines : null;
  if (!engines || typeof engines.api !== "number" || !Number.isInteger(engines.api) || engines.api < 1) {
    return { ok: false, reason: "invalid-manifest", detail: "engines.api absent ou invalide" };
  }
  if (engines.api > PLUGIN_API_MAX) {
    return { ok: false, reason: "api-too-new", detail: `engines.api ${engines.api} > ${PLUGIN_API_MAX}` };
  }
  const appRange = isStr(engines.app) ? engines.app.trim() : undefined;
  if (appRange && opts?.appVersion && !satisfiesRange(appRange, opts.appVersion)) {
    return { ok: false, reason: "engine-mismatch", detail: `engines.app ${appRange} incompatible avec ${opts.appVersion}` };
  }

  const name = readLocalized(raw.name);
  if (!name) return { ok: false, reason: "invalid-manifest", detail: "champ name absent" };

  const description = raw.description !== undefined ? readLocalized(raw.description) : undefined;

  const permissions: PluginPermissionV2[] = [];
  if (raw.permissions !== undefined) {
    if (!Array.isArray(raw.permissions)) {
      return { ok: false, reason: "invalid-manifest", detail: "permissions doit etre une liste" };
    }
    for (const p of raw.permissions) {
      if (isStr(p) && (PLUGIN_PERMISSIONS_V2 as readonly string[]).includes(p)) {
        permissions.push(p as PluginPermissionV2);
      }
    }
  }

  const contributes = validateContributes(raw.contributes, diagnostics);

  if (diagnostics.length > 0) {
    return { ok: false, reason: "invalid-manifest", detail: "expression trkx invalide", diagnostics };
  }

  const manifest: PluginManifestV2 = {
    format: "trk.extension/2",
    id,
    version,
    ...(isStr(raw.publisher) ? { publisher: raw.publisher.trim() } : {}),
    ...(isStr(raw.license) ? { license: raw.license.trim() } : {}),
    ...(isStr(raw.homepage) ? { homepage: raw.homepage.trim() } : {}),
    engines: { api: engines.api, ...(appRange ? { app: appRange } : {}) },
    name,
    ...(description ? { description } : {}),
    ...(isStr(raw.icon) ? { icon: raw.icon.trim() } : {}),
    ...(Array.isArray(raw.categories) ? { categories: raw.categories.filter(isStr) } : {}),
    ...(Array.isArray(raw.keywords) ? { keywords: raw.keywords.filter(isStr) } : {}),
    permissions,
    ...(isRecord(raw.locales) ? { locales: {
      ...(isStr(raw.locales.dir) ? { dir: raw.locales.dir } : {}),
      ...(isStr(raw.locales.default) ? { default: raw.locales.default } : {}),
    } } : {}),
    ...(contributes ? { contributes } : {}),
  };
  return { ok: true, manifest };
}

function validateContributes(value: unknown, diagnostics: Diagnostic[]): Contributes | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    diagnostics.push({ code: "E_INVALID", message: "contributes doit etre un objet", offset: 0, length: 0 });
    return undefined;
  }
  const out: Contributes = {};

  if (value.docTypes !== undefined) {
    if (!Array.isArray(value.docTypes)) {
      diagnostics.push({ code: "E_INVALID", message: "contributes.docTypes doit etre une liste", offset: 0, length: 0 });
    } else {
      out.docTypes = value.docTypes.filter(isRecord).map((d) => ({
        id: isStr(d.id) ? d.id : "",
        dataVersion: typeof d.dataVersion === "number" ? d.dataVersion : 0,
        ...(isStr(d.migrations) ? { migrations: d.migrations } : {}),
      }));
    }
  }

  if (value.views !== undefined) {
    if (!Array.isArray(value.views)) {
      diagnostics.push({ code: "E_INVALID", message: "contributes.views doit etre une liste", offset: 0, length: 0 });
    } else {
      out.views = value.views
        .filter(isRecord)
        .map((v) => {
          const kind = v.kind === "declarative" || v.kind === "app" ? v.kind : "declarative";
          if (kind === "declarative") {
            if (!isStr(v.spec)) diagnostics.push({ code: "E_INVALID", message: "vue declarative sans spec", offset: 0, length: 0 });
          } else if (!isStr(v.entry)) {
            diagnostics.push({ code: "E_INVALID", message: "vue app sans entry", offset: 0, length: 0 });
          }
          const view: ViewContrib = {
            id: isStr(v.id) ? v.id : "",
            kind,
            ...(isStr(v.spec) ? { spec: v.spec } : {}),
            ...(isStr(v.entry) ? { entry: v.entry } : {}),
            ...(isStr(v.docType) ? { docType: v.docType } : {}),
            ...(isStr(v.icon) ? { icon: v.icon } : {}),
            ...(readLocalized(v.title) ? { title: readLocalized(v.title)! } : {}),
            ...(Array.isArray(v.scopes) ? { scopes: v.scopes.filter((s) => s === "global" || s === "project") } : {}),
            ...(v.singleton === true ? { singleton: true } : {}),
          };
          return view;
        })
        .filter((v) => v.id);
    }
  }

  if (value.commands !== undefined) {
    if (!Array.isArray(value.commands)) {
      diagnostics.push({ code: "E_INVALID", message: "contributes.commands doit etre une liste", offset: 0, length: 0 });
    } else {
      out.commands = value.commands
        .filter(isRecord)
        .map((c) => {
          if (c.when !== undefined) diagnostics.push(...checkExpr(isStr(c.when) ? c.when : undefined, SCOPE.commandWhen));
          return {
            id: isStr(c.id) ? c.id : "",
            ...(isStr(c.icon) ? { icon: c.icon } : {}),
            ...(readLocalized(c.title) ? { title: readLocalized(c.title)! } : {}),
            ...(isStr(c.when) ? { when: c.when } : {}),
          } as CommandContrib;
        })
        .filter((c) => c.id);
    }
  }

  if (value.taskColumns !== undefined) {
    if (!Array.isArray(value.taskColumns)) {
      diagnostics.push({ code: "E_INVALID", message: "contributes.taskColumns doit etre une liste", offset: 0, length: 0 });
    } else {
      out.taskColumns = value.taskColumns
        .filter(isRecord)
        .map((c) => {
          if (!isStr(c.value)) diagnostics.push({ code: "E_INVALID", message: "colonne sans value", offset: 0, length: 0 });
          else diagnostics.push(...checkExpr(c.value, SCOPE.contributedColumn));
          if (isStr(c.tone)) diagnostics.push(...checkExpr(c.tone, SCOPE.contributedColumn));
          return {
            id: isStr(c.id) ? c.id : "",
            value: isStr(c.value) ? c.value : "",
            ...(isStr(c.as) ? { as: c.as } : {}),
            ...(isStr(c.width) ? { width: c.width } : {}),
            ...(isStr(c.tone) ? { tone: c.tone } : {}),
            ...(readLocalized(c.label) ? { label: readLocalized(c.label)! } : {}),
          } as TaskColumnContrib;
        })
        .filter((c) => c.id && c.value);
    }
  }

  if (value.taskPanels !== undefined) {
    if (!Array.isArray(value.taskPanels)) {
      diagnostics.push({ code: "E_INVALID", message: "contributes.taskPanels doit etre une liste", offset: 0, length: 0 });
    } else {
      out.taskPanels = value.taskPanels
        .filter(isRecord)
        .map((p) => {
          const kind = p.kind === "declarative" || p.kind === "app" ? p.kind : "declarative";
          return {
            id: isStr(p.id) ? p.id : "",
            kind,
            ...(isStr(p.spec) ? { spec: p.spec } : {}),
            ...(isStr(p.entry) ? { entry: p.entry } : {}),
            ...(readLocalized(p.title) ? { title: readLocalized(p.title)! } : {}),
          } as TaskPanelContrib;
        })
        .filter((p) => p.id);
    }
  }

  if (value.settings !== undefined) {
    if (!isRecord(value.settings)) {
      diagnostics.push({ code: "E_INVALID", message: "contributes.settings doit etre un objet", offset: 0, length: 0 });
    } else {
      const settings: Record<string, SettingDef> = {};
      for (const [key, def] of Object.entries(value.settings)) {
        if (!isRecord(def) || !isStr(def.type)) {
          diagnostics.push({ code: "E_INVALID", message: `setting ${key} invalide`, offset: 0, length: 0 });
          continue;
        }
        const type = def.type as string;
        if (!["enum", "number", "boolean", "string"].includes(type)) {
          diagnostics.push({ code: "E_INVALID", message: `setting ${key} : type ${type} inconnu`, offset: 0, length: 0 });
          continue;
        }
        const s: SettingDef = { type: type as SettingType };
        if (type === "enum") {
          if (!Array.isArray(def.values) || def.values.some((x) => !isStr(x))) {
            diagnostics.push({ code: "E_INVALID", message: `setting ${key} enum sans values`, offset: 0, length: 0 });
            continue;
          }
          s.values = def.values.filter(isStr);
        }
        if (type === "number") {
          if (typeof def.min === "number") s.min = def.min;
          if (typeof def.max === "number") s.max = def.max;
        }
        if (def.default !== undefined) s.default = def.default;
        if (readLocalized(def.label)) s.label = readLocalized(def.label)!;
        settings[key] = s;
      }
      out.settings = settings;
    }
  }

  return out;
}
