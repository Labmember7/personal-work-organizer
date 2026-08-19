// Facade « hote » du langage `trkx` (docs/plugins/trkx-langage.md).
//
// `expr.ts` est le module pur et complet du langage. Ce fichier enregistre les
// fonctions resolues par l'hote (`statusLabel`, `prioLabel`, `t`, ...) et expose
// l'API historique (`parse` / `evaluate` / `run`) consommée par `DeclarativeView`,
// en gardant sa signature (rend une `Value`, jamais un objet).

import { statusOf, prioOf } from "../statuses";
import {
  analyze as exprAnalyze,
  compile as exprCompile,
  evaluate as exprEvaluate,
  parse as exprParse,
  run as exprRun,
  type CompileOptions,
  type Diagnostic,
  type EvalContext,
  type FnImpl,
  type Node,
  type Value,
} from "./expr";

const hostFns: Record<string, FnImpl> = {
  statusLabel: (args) => statusOf(typeof argStr(args[0]) === "string" ? argStr(args[0]) : undefined).label,
  statusColor: (args) => statusOf(typeof argStr(args[0]) === "string" ? argStr(args[0]) : undefined).color,
  prioLabel: (args) => prioOf(typeof argStr(args[0]) === "string" ? argStr(args[0]) : undefined).label,
  prioColor: (args) => prioOf(typeof argStr(args[0]) === "string" ? argStr(args[0]) : undefined).color,
  t: (args, vars) => {
    const key = argStr(args[0]);
    const fallback: Value = args[1] !== undefined ? argVal(args[1], vars) : (key ?? null);
    if (typeof key !== "string") return fallback;
    const locales = vars.locales;
    if (locales && typeof locales === "object" && !Array.isArray(locales)) {
      const found = (locales as Record<string, Value>)[key];
      if (typeof found === "string") return found;
    }
    return fallback;
  },
};

const hostOpts: CompileOptions = { functions: hostFns, tag: "host" };

function argStr(a: Node | undefined): string | undefined {
  if (!a) return undefined;
  if (a.t === "lit" && typeof a.v === "string") return a.v;
  return undefined;
}

// Les arguments `t(key, fallback?)` sont paresseux : on lit leur valeur via le
// contexte courant sans reevaluer l'AST complet ici.
function argVal(a: Node, vars: Record<string, Value>): Value {
  if (a.t === "lit") return a.v;
  if (a.t === "id") return vars[a.name] ?? null;
  return null;
}

export type { Diagnostic, Value, Node, EvalContext } from "./expr";

export function parse(source: string): Node | null {
  const res = exprParse(source);
  return res.ok ? res.ast : null;
}

/** Equivalent historique : rend la valeur (pas l'objet {value, warnings}). */
export function evaluate(ast: Node, ctx: EvalContext): Value {
  return exprEvaluate(ast, ctx, hostOpts).value;
}

export function run(source: string, ctx: EvalContext): Value {
  return exprRun(source, ctx, hostOpts);
}

/** Analyse statique avec les fonctions hote (utilisee par la validation). */
export function analyze(ast: Node, scope: Set<string>): Diagnostic[] {
  return exprAnalyze(ast, scope, hostOpts);
}

/** Compilation memoise avec les fonctions hote. */
export function compile(source: string, scope: Set<string>) {
  return exprCompile(source, scope, hostOpts);
}
