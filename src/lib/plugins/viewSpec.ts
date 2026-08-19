// Validation d'une specification de vue declarative `trk.view/1`
// (PLUGIN_FORMAT_V2.md § 5, docs/plugins/anatomie-plugin.md B.2).
//
// Une spec est du JSON ou du YAML (meme schema). On valide la structure, le
// `source`, le `layout.type`, et on analyse statiquement chaque expression
// `trkx` declaree (where, group, sort, columns[].value/tone, footer). Ne leve
// jamais.

import type { LocalizedText } from "./types";
import type { Diagnostic } from "./expr";
import { SCOPE } from "./expr";
import { analyze as exprAnalyze, parse as exprParse } from "./trkx";

const SOURCES = new Set(["tasks", "projects", "doc"]);
const LAYOUT_TYPES = new Set(["table", "cards", "board", "timeline", "chart", "stats"]);
const AS_VALUES = new Set(["text", "badge", "gauge", "date", "duration", "taskLink"]);

export interface ViewColumn {
  label?: LocalizedText;
  value: string;
  as?: string;
  align?: "left" | "right";
  width?: string;
  tone?: string;
}

export interface ViewLayout {
  type: string;
  columns?: ViewColumn[];
  footer?: ViewColumn[];
}

export interface ViewSpecV1 {
  spec: "trk.view/1";
  source?: string;
  where?: string;
  group?: string;
  sort?: string;
  empty?: LocalizedText;
  layout?: ViewLayout;
}

export type ViewSpecResult =
  | { ok: true; spec: ViewSpecV1 }
  | { ok: false; reason: "parse" | "invalid-spec"; detail: string; diagnostics?: Diagnostic[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readLocalized(value: unknown): LocalizedText | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value)) return null;
  const out: Record<string, string> = {};
  for (const [lang, text] of Object.entries(value)) {
    if (typeof text === "string" && text.trim()) out[lang] = text.trim();
  }
  return Object.keys(out).length ? out : null;
}

/** Analyse une expression trkx dans une portee. Vide = OK. */
function checkExpr(source: string | undefined, scope: Set<string>): Diagnostic[] {
  if (!source || typeof source !== "string") return [];
  const parsed = exprParse(source);
  if (!parsed) return [{ code: "E_PARSE", message: `expression invalide : ${source}`, offset: 0, length: source.length }];
  return exprAnalyze(parsed, scope);
}

/** Parse un .trkv : JSON d'abord, YAML minimal ensuite. */
export function parseViewSpecText(text: string): { ok: true; data: unknown } | { ok: false; reason: "parse"; detail: string } {
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    try {
      return { ok: true, data: parseYaml(text) };
    } catch (e) {
      return { ok: false, reason: "parse", detail: e instanceof Error ? e.message : "YAML invalide" };
    }
  }
}

export function validateViewSpec(spec: unknown): ViewSpecResult {
  if (!isRecord(spec)) return { ok: false, reason: "invalid-spec", detail: "objet attendu" };
  if (spec.spec !== "trk.view/1") {
    return { ok: false, reason: "invalid-spec", detail: `spec=${String(spec.spec)} (attendu trk.view/1)` };
  }
  const diagnostics: Diagnostic[] = [];

  const source = spec.source !== undefined ? (typeof spec.source === "string" ? spec.source : "") : "tasks";
  if (!SOURCES.has(source)) {
    return { ok: false, reason: "invalid-spec", detail: `source=${source}` };
  }

  const grouped = typeof spec.group === "string" && spec.group.length > 0;
  const valueScope = grouped ? SCOPE.groupedColumn : SCOPE.flatColumn;
  const sortScope = grouped ? SCOPE.groupedColumn : SCOPE.tasks;

  diagnostics.push(...checkExpr(typeof spec.where === "string" ? spec.where : undefined, SCOPE.tasks));
  diagnostics.push(...checkExpr(typeof spec.group === "string" ? spec.group : undefined, SCOPE.tasks));
  diagnostics.push(...checkExpr(typeof spec.sort === "string" ? spec.sort : undefined, sortScope));

  const layoutRaw = spec.layout;
  let layout: ViewLayout | undefined;
  if (layoutRaw !== undefined) {
    if (!isRecord(layoutRaw)) {
      return { ok: false, reason: "invalid-spec", detail: "layout doit etre un objet" };
    }
    const type = typeof layoutRaw.type === "string" ? layoutRaw.type : "";
    if (!LAYOUT_TYPES.has(type)) {
      return { ok: false, reason: "invalid-spec", detail: `layout.type=${type}` };
    }
    const cols = validateColumns(layoutRaw.columns, valueScope, diagnostics);
    const footer = validateColumns(layoutRaw.footer, valueScope, diagnostics);
    layout = { type, ...(cols ? { columns: cols } : {}), ...(footer ? { footer } : {}) };
  }

  if (diagnostics.length > 0) {
    return { ok: false, reason: "invalid-spec", detail: "expression trkx invalide", diagnostics };
  }

  const out: ViewSpecV1 = { spec: "trk.view/1" };
  if (source !== "tasks") out.source = source;
  if (typeof spec.where === "string") out.where = spec.where;
  if (typeof spec.group === "string") out.group = spec.group;
  if (typeof spec.sort === "string") out.sort = spec.sort;
  const empty = spec.empty !== undefined ? readLocalized(spec.empty) : undefined;
  if (empty) out.empty = empty;
  if (layout) out.layout = layout;
  return { ok: true, spec: out };
}

function validateColumns(value: unknown, scope: Set<string>, diagnostics: Diagnostic[]): ViewColumn[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "E_INVALID", message: "columns doit etre une liste", offset: 0, length: 0 });
    return undefined;
  }
  const cols: ViewColumn[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) {
      diagnostics.push({ code: "E_INVALID", message: "colonne invalide", offset: 0, length: 0 });
      continue;
    }
    const label = readLocalized(raw.label);
    if (typeof raw.value !== "string") {
      diagnostics.push({ code: "E_INVALID", message: "colonne sans value", offset: 0, length: 0 });
      continue;
    }
    diagnostics.push(...checkExpr(raw.value, scope));
    if (typeof raw.tone === "string") diagnostics.push(...checkExpr(raw.tone, scope));
    const col: ViewColumn = { value: raw.value };
    if (label) col.label = label;
    if (typeof raw.as === "string") {
      if (!AS_VALUES.has(raw.as)) {
        diagnostics.push({ code: "E_INVALID", message: `as=${raw.as} inconnu`, offset: 0, length: 0 });
        continue;
      }
      col.as = raw.as;
    }
    if (raw.align === "left" || raw.align === "right") col.align = raw.align;
    if (typeof raw.width === "string") col.width = raw.width;
    if (typeof raw.tone === "string") col.tone = raw.tone;
    cols.push(col);
  }
  return cols;
}

// ── YAML minimal (subset utilise par les .trkv) ──────────────────────────────

interface YLine {
  indent: number;
  text: string;
}

function parseYaml(text: string): unknown {
  const lines: YLine[] = text
    .split(/\r?\n/)
    .map((l) => {
      const trimmed = l.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return null;
      const indent = l.length - l.trimStart().length;
      return { indent, text: trimmed };
    })
    .filter((l): l is YLine => l !== null);

  let pos = 0;

  function parseScalar(s: string): unknown {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1);
    }
    if (s === "true") return true;
    if (s === "false") return false;
    if (s === "null" || s === "~" || s === "") return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  function parseFlow(s: string): unknown {
    if (s.startsWith("[")) {
      const inner = s.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((x) => parseFlow(x.trim()));
    }
    if (s.startsWith("{")) {
      const inner = s.slice(1, -1).trim();
      const out: Record<string, unknown> = {};
      if (!inner) return out;
      for (const part of inner.split(",")) {
        const idx = part.indexOf(":");
        if (idx < 0) continue;
        out[part.slice(0, idx).trim()] = parseFlow(part.slice(idx + 1).trim());
      }
      return out;
    }
    return parseScalar(s);
  }

  function parseValue(s: string): unknown {
    if (s.startsWith("[") || s.startsWith("{")) return parseFlow(s);
    return parseScalar(s);
  }

  function parseBlock(indent: number): unknown {
    // Sequence ?
    if (pos < lines.length && lines[pos]!.text.startsWith("- ") && lines[pos]!.indent === indent) {
      const arr: unknown[] = [];
      while (pos < lines.length && lines[pos]!.indent === indent && lines[pos]!.text.startsWith("- ")) {
        const itemText = lines[pos]!.text.slice(2).trim();
        if (itemText.startsWith("{") || itemText.startsWith("[")) {
          arr.push(parseValue(itemText));
          pos += 1;
        } else if (itemText.includes(":") && !itemText.startsWith('"') && !itemText.startsWith("'")) {
          // "- key: value" : traiter comme map inline a cette ligne, puis suite possible
          const saved = pos;
          pos += 1;
          const map = parseBlock(indent + 2);
          const firstKey = itemText.slice(0, itemText.indexOf(":")).trim();
          const firstVal = itemText.slice(itemText.indexOf(":") + 1).trim();
          const obj: Record<string, unknown> = { [firstKey]: firstVal ? parseValue(firstVal) : map };
          if (typeof map === "object" && map !== null && !Array.isArray(map)) Object.assign(obj, map);
          void saved;
          arr.push(obj);
        } else {
          arr.push(parseValue(itemText));
          pos += 1;
        }
      }
      return arr;
    }
    // Mapping
    const obj: Record<string, unknown> = {};
    while (pos < lines.length && lines[pos]!.indent === indent && !lines[pos]!.text.startsWith("- ")) {
      const line = lines[pos]!;
      const idx = line.text.indexOf(":");
      if (idx < 0) throw new Error(`YAML: ligne mal formee: ${line.text}`);
      const key = line.text.slice(0, idx).trim();
      const rest = line.text.slice(idx + 1).trim();
      if (rest === "") {
        pos += 1;
        if (pos < lines.length && lines[pos]!.indent > indent) {
          obj[key] = parseBlock(lines[pos]!.indent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseValue(rest);
        pos += 1;
      }
    }
    return obj;
  }

  const result = parseBlock(0);
  return result;
}
