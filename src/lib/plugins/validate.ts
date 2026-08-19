import { parseManifestV2 } from "./manifest2";
import { parseViewSpecText, validateViewSpec } from "./viewSpec";
import { parse, analyze, SCOPE } from "./expr";

export interface ValidationDiagnostic {
  file: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  diagnostics: ValidationDiagnostic[];
}

/** Lecture de fichiers injectee : le CLI fournit fs, les tests un FS en memoire. */
export type ReadFile = (rel: string) => string | null;
export type Exists = (rel: string) => boolean;

function diag(file: string, code: string, message: string): ValidationDiagnostic {
  return { file, code, message };
}

/** Un chemin de ressource est-il contenu dans le paquet (pas de sortie) ? */
function isSafeRel(rel: string): boolean {
  if (!rel || rel.startsWith("/") || rel.startsWith("\\") || rel.includes(":")) return false;
  const parts = rel.split(/[/\\]/);
  return !parts.includes("..");
}

function analyzeExpr(
  source: string | undefined,
  scope: Set<string>,
  file: string,
  label: string,
): ValidationDiagnostic[] {
  if (!source || typeof source !== "string") return [];
  const parsed = parse(source);
  if (!parsed.ok) {
    return parsed.errors.map((d) => diag(file, d.code ?? "E_PARSE", `${label} : ${d.message}`));
  }
  return analyze(parsed.ast, scope).map((d) =>
    diag(file, d.code ?? "E_TRKX", `${label} : ${d.message}`),
  );
}

function hasDefaultLocale(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return typeof o.fr === "string" || typeof o.en === "string";
  }
  return false;
}

/**
 * Valide un dossier de plugin v2 : manifeste, chemins de ressources, locales,
 * et expressions trkx (commandes, colonnes, specs de vues/panneaux).
 * `read`/`exists` sont exprimes en chemins relatifs (slash) par rapport au dossier.
 */
export function validatePluginFolder(
  baseDir: string,
  read: ReadFile,
  exists: Exists,
  manifestRel = "manifest.json",
): ValidationResult {
  const diags: ValidationDiagnostic[] = [];

  if (!exists(manifestRel)) {
    return { ok: false, diagnostics: [diag(manifestRel, "E_NO_MANIFEST", "manifest.json introuvable")] };
  }
  const manifestJson = read(manifestRel);
  if (manifestJson === null) {
    return { ok: false, diagnostics: [diag(manifestRel, "E_READ", "manifest.json illisible")] };
  }

  const parsed = parseManifestV2(manifestJson);
  if (!parsed.ok) {
    const inner = (parsed.diagnostics ?? []).map((d) =>
      diag(manifestRel, d.code ?? parsed.reason, d.message),
    );
    return {
      ok: false,
      diagnostics: [diag(manifestRel, parsed.reason, parsed.detail || parsed.reason), ...inner],
    };
  }

  const m = parsed.manifest;
  const c = m.contributes;
  if (!hasDefaultLocale(m.name)) {
    diags.push(diag(manifestRel, "E_LOCALE", "name : locale par defaut manquante (fr/en)"));
  }

  const checkResource = (rel: string | undefined, label: string) => {
    if (!rel) return;
    if (!isSafeRel(rel)) {
      diags.push(diag(manifestRel, "E_PATH", `${label} : chemin non autorise (${rel})`));
      return;
    }
    if (!exists(rel)) diags.push(diag(manifestRel, "E_MISSING", `${label} : fichier introuvable (${rel})`));
  };

  const validateSpecFile = (rel: string, label: string) => {
    const text = read(rel);
    if (text === null) return;
    const parsedSpec = parseViewSpecText(text);
    if (!parsedSpec.ok) {
      diags.push(diag(rel, "E_VIEW_PARSE", `${label} : ${parsedSpec.detail}`));
      return;
    }
    const res = validateViewSpec(parsedSpec.data);
    if (!res.ok) {
      const inner = (res.diagnostics ?? []).map((d) => diag(rel, d.code ?? res.reason, d.message));
      diags.push(diag(rel, res.reason, `${label} : ${res.detail}`), ...inner);
    }
  };

  if (c) {
    for (const v of c.views ?? []) {
      if (!hasDefaultLocale(v.title)) {
        diags.push(diag(manifestRel, "E_LOCALE", `views.${v.id}.title : locale par defaut manquante`));
      }
      if (v.kind === "declarative") {
        checkResource(v.spec, `views.${v.id}.spec`);
        if (v.spec && exists(v.spec)) validateSpecFile(v.spec, `views.${v.id}`);
      } else {
        checkResource(v.entry, `views.${v.id}.entry`);
      }
    }
    for (const cmd of c.commands ?? []) {
      if (!hasDefaultLocale(cmd.title)) {
        diags.push(diag(manifestRel, "E_LOCALE", `commands.${cmd.id}.title : locale par defaut manquante`));
      }
      diags.push(...analyzeExpr(cmd.when, SCOPE.commandWhen, manifestRel, `commands.${cmd.id}.when`));
    }
    for (const col of c.taskColumns ?? []) {
      if (!hasDefaultLocale(col.label)) {
        diags.push(diag(manifestRel, "E_LOCALE", `taskColumns.${col.id}.label : locale par defaut manquante`));
      }
      diags.push(...analyzeExpr(col.value, SCOPE.contributedColumn, manifestRel, `taskColumns.${col.id}.value`));
      diags.push(...analyzeExpr(col.tone, SCOPE.contributedColumn, manifestRel, `taskColumns.${col.id}.tone`));
    }
    for (const p of c.taskPanels ?? []) {
      if (!hasDefaultLocale(p.title)) {
        diags.push(diag(manifestRel, "E_LOCALE", `taskPanels.${p.id}.title : locale par defaut manquante`));
      }
      if (p.kind === "declarative") {
        checkResource(p.spec, `taskPanels.${p.id}.spec`);
        if (p.spec && exists(p.spec)) validateSpecFile(p.spec, `taskPanels.${p.id}`);
      } else {
        checkResource(p.entry, `taskPanels.${p.id}.entry`);
      }
    }
    for (const [sid, def] of Object.entries(c.settings ?? {})) {
      if (!hasDefaultLocale(def.label)) {
        diags.push(diag(manifestRel, "E_LOCALE", `settings.${sid}.label : locale par defaut manquante`));
      }
    }
  }

  return { ok: diags.length === 0, diagnostics: diags };
}

export function formatDiagnostics(result: ValidationResult): string[] {
  return result.diagnostics.map((d) => `${d.file}: ${d.code}: ${d.message}`);
}
