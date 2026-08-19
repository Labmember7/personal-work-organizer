// Langage d'expression `trkx` (spec normative : docs/plugins/trkx-langage.md).
//
// Mini-langage total, pur, sans eval, sans exception, deterministe. Sert les
// champs where / sort / group / value / when des vues declaratives et des
// colonnes contribuees. Toute evaluation termine (budget de pas), ne leve
// jamais (une expression fausse rend null), et ne peut atteindre ni globale ni
// effet de bord : now et lang sont injectes par l'hote.
//
// Module pur : aucune dependance externe. Les fonctions propres a l'hote
// (statusLabel, t, ...) sont enregistrees par trkx.ts via les options
// functions, seule surface d'extension.

// ── Types ───────────────────────────────────────────────────────────────────

export type Value = null | boolean | number | string | Value[] | { [k: string]: Value };

export interface Token {
  k: "num" | "str" | "id" | "op";
  v: string;
  offset: number;
  length: number;
}

export interface Diagnostic {
  code: string;
  message: string;
  offset: number;
  length: number;
}

export type ParseResult = { ok: true; ast: Node } | { ok: false; errors: Diagnostic[] };

export type Node =
  | { t: "lit"; v: Value }
  | { t: "id"; name: string }
  | { t: "get"; obj: Node; key: string }
  | { t: "index"; obj: Node; idx: Node }
  | { t: "call"; name: string; args: Node[] }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node };

/** Contexte d'evaluation : projections et valeurs injectees par l'hote. */
export type EvalContext = Record<string, Value>;

/** Signature d'une fonction du langage. rawArgs sont les AST des arguments. */
export type FnImpl = (rawArgs: Node[], vars: Record<string, Value>, st: EvalState) => Value;

export interface CompileOptions {
  /** Fonctions additionnelles (resolues par l'hote). */
  functions?: Record<string, FnImpl>;
  /** Arites des fonctions additionnelles [min, max]. */
  arities?: Record<string, [number, number]>;
  /** Etiquette de cache (distinguie deux jeux de fonctions). */
  tag?: string;
}

interface EvalState {
  vars: Record<string, Value>;
  steps: number;
  warnings: string[];
  functions: Record<string, FnImpl>;
}

// ── Constantes de budget (A.9) ───────────────────────────────────────────────

const MAX_SOURCE = 4096;
const MAX_AST_DEPTH = 64;
const MAX_STEPS = 50_000;
const MAX_LIST = 20_000;
const MAX_CMP_DEPTH = 16;

const FORBIDDEN_PROPS = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

const KEYWORDS = new Set(["and", "or", "not", "in", "true", "false", "null"]);

// Arite des fonctions de base : [min, max] (max = 99 pour variadique).
const BASE_ARITY: Record<string, [number, number]> = {
  count: [1, 1], sum: [1, 2], avg: [1, 2], min: [1, 2], max: [1, 2],
  first: [1, 1], last: [1, 1], take: [2, 2], filter: [2, 2], sort: [1, 2],
  reverse: [1, 1], unique: [1, 2], groupBy: [2, 2], pluck: [2, 2], flatten: [1, 1],
  join: [1, 2], upper: [1, 1], lower: [1, 1], trim: [1, 1], truncate: [2, 3],
  contains: [2, 2], startsWith: [2, 2], endsWith: [2, 2], replace: [3, 3],
  round: [1, 2], percent: [1, 2], abs: [1, 1], clamp: [3, 3], duration: [1, 1],
  date: [1, 2],   days: [1, 2], overdue: [1, 1], age: [1, 2], default: [2, 2],
  coalesce: [2, 99], if: [3, 3],
};

const BASE_FNS: Record<string, FnImpl> = buildBaseFns();

// ── Lexer (A.3) ──────────────────────────────────────────────────────────────

const ESCAPES: Record<string, string> = { "\\": "\\", "'": "'", '"': '"', n: "\n", t: "\t" };

function lex(src: string): { tokens: Token[]; errors: Diagnostic[] } {
  const tokens: Token[] = [];
  const errors: Diagnostic[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "#") {
      while (i < n && src[i] !== "\n") i += 1;
      continue;
    }
    if (c >= "0" && c <= "9") {
      const start = i;
      while (i < n && src[i]! >= "0" && src[i]! <= "9") i += 1;
      if (src[i] === "." && src[i + 1]! >= "0" && src[i + 1]! <= "9") {
        i += 1;
        while (i < n && src[i]! >= "0" && src[i]! <= "9") i += 1;
      }
      const text = src.slice(start, i);
      tokens.push({ k: "num", v: text, offset: start, length: i - start });
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      const start = i;
      i += 1;
      let value = "";
      let closed = false;
      while (i < n) {
        const ch = src[i]!;
        if (ch === "\\") {
          const next = src[i + 1];
          if (next === undefined) break;
          value += ESCAPES[next] ?? next;
          i += 2;
          continue;
        }
        if (ch === quote) {
          closed = true;
          i += 1;
          break;
        }
        value += ch;
        i += 1;
      }
      if (!closed) {
        errors.push({ code: "E_LEX", message: "chaine non terminee", offset: start, length: i - start });
        break;
      }
      tokens.push({ k: "str", v: value, offset: start, length: i - start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i;
      while (i < n && /[A-Za-z0-9_]/.test(src[i]!)) i += 1;
      tokens.push({ k: "id", v: src.slice(start, i), offset: start, length: i - start });
      continue;
    }
    const two = src.slice(0, 2);
    void two;
    const pair = src.slice(i, i + 2);
    if (pair === "==" || pair === "!=" || pair === "<=" || pair === ">=") {
      tokens.push({ k: "op", v: pair, offset: i, length: 2 });
      i += 2;
      continue;
    }
    if ("+-*/%<>,.()[]|".includes(c)) {
      tokens.push({ k: "op", v: c, offset: i, length: 1 });
      i += 1;
      continue;
    }
    errors.push({ code: "E_LEX", message: `caractere inattendu ${c}`, offset: i, length: 1 });
    break;
  }
  return { tokens, errors };
}

// ── Parser (A.4) ─────────────────────────────────────────────────────────────

class ParseError extends Error {
  constructor(message: string, public readonly offset: number) {
    super(message);
  }
}

class Parser {
  private i = 0;
  constructor(private readonly toks: Token[]) {}

  private peek(): Token | undefined {
    return this.toks[this.i];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return t?.k === "op" && t.v === v;
  }
  private isId(v: string): boolean {
    const t = this.peek();
    return t?.k === "id" && t.v === v;
  }
  private eat(): Token {
    const t = this.toks[this.i];
    if (!t) throw new ParseError("fin d'expression inattendue", this.prevOffset());
    this.i += 1;
    return t;
  }
  private prevOffset(): number {
    const t = this.toks[this.i - 1];
    return t ? t.offset : 0;
  }
  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new ParseError(`${v} attendu`, this.prevOffset());
    this.i += 1;
  }

  parse(): Node {
    const node = this.or();
    const rest = this.peek();
    if (rest) throw new ParseError("jetons en trop", rest.offset);
    return node;
  }

  private or(): Node {
    let a = this.and();
    while (this.isId("or")) {
      this.i += 1;
      a = { t: "bin", op: "or", a, b: this.and() };
    }
    return a;
  }
  private and(): Node {
    let a = this.not();
    while (this.isId("and")) {
      this.i += 1;
      a = { t: "bin", op: "and", a, b: this.not() };
    }
    return a;
  }
  private not(): Node {
    if (this.isId("not")) {
      this.i += 1;
      return { t: "un", op: "not", a: this.not() };
    }
    return this.cmp();
  }
  private cmp(): Node {
    const a = this.add();
    const tok = this.peek();
    if (tok?.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(tok.v)) {
      this.i += 1;
      const b = this.add();
      const tok2 = this.peek();
      if (tok2?.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(tok2.v)) {
        throw new ParseError("comparaison chainee ; parentheser", tok2.offset);
      }
      return { t: "bin", op: tok.v, a, b };
    }
    if (this.isId("in")) {
      this.i += 1;
      return { t: "bin", op: "in", a, b: this.add() };
    }
    return a;
  }
  private add(): Node {
    let a = this.mul();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.eat().v;
      a = { t: "bin", op, a, b: this.mul() };
    }
    return a;
  }
  private mul(): Node {
    let a = this.pipe();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.eat().v;
      a = { t: "bin", op, a, b: this.pipe() };
    }
    return a;
  }
  private pipe(): Node {
    let a = this.unary();
    while (this.isOp("|")) {
      this.i += 1;
      const name = this.eat();
      if (name.k !== "id") throw new ParseError("nom de filtre attendu apres |", name.offset);
      const args: Node[] = [a];
      if (this.isOp("(")) {
        this.i += 1;
        if (!this.isOp(")")) {
          args.push(this.or());
          while (this.isOp(",")) {
            this.i += 1;
            args.push(this.or());
          }
        }
        this.expectOp(")");
      }
      a = { t: "call", name: name.v, args };
    }
    return a;
  }
  private unary(): Node {
    if (this.isOp("-")) {
      this.i += 1;
      return { t: "un", op: "-", a: this.unary() };
    }
    return this.postfix();
  }
  private postfix(): Node {
    let a = this.primary();
    for (;;) {
      if (this.isOp(".")) {
        this.i += 1;
        const key = this.eat();
        if (key.k !== "id") throw new ParseError("nom de propriete attendu apres .", key.offset);
        a = { t: "get", obj: a, key: key.v };
      } else if (this.isOp("[")) {
        this.i += 1;
        const idx = this.or();
        this.expectOp("]");
        a = { t: "index", obj: a, idx };
      } else {
        break;
      }
    }
    return a;
  }
  private primary(): Node {
    const tok = this.eat();
    if (tok.k === "num") return { t: "lit", v: Number(tok.v) };
    if (tok.k === "str") return { t: "lit", v: tok.v };
    if (tok.k === "op" && tok.v === "(") {
      const inner = this.or();
      this.expectOp(")");
      return inner;
    }
    if (tok.k === "op" && tok.v === "[") {
      const items: Node[] = [];
      if (!this.isOp("]")) {
        items.push(this.or());
        while (this.isOp(",")) {
          this.i += 1;
          items.push(this.or());
        }
      }
      this.expectOp("]");
      return { t: "call", name: "__list", args: items };
    }
    if (tok.k === "id") {
      if (tok.v === "true") return { t: "lit", v: true };
      if (tok.v === "false") return { t: "lit", v: false };
      if (tok.v === "null") return { t: "lit", v: null };
      if (this.isOp("(")) {
        this.i += 1;
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.or());
          while (this.isOp(",")) {
            this.i += 1;
            args.push(this.or());
          }
        }
        this.expectOp(")");
        return { t: "call", name: tok.v, args };
      }
      return { t: "id", name: tok.v };
    }
    throw new ParseError(`jeton inattendu ${tok.v}`, tok.offset);
  }
}

/** Analyse une source. Rend null (avec erreurs) si elle est invalide. */
export function parse(source: string): ParseResult {
  if (source.length > MAX_SOURCE) {
    return {
      ok: false,
      errors: [{ code: "E_SOURCE_LONG", message: `source > ${MAX_SOURCE} caracteres`, offset: 0, length: source.length }],
    };
  }
  const { tokens, errors } = lex(source);
  if (errors.length > 0) return { ok: false, errors };
  try {
    const ast = new Parser(tokens).parse();
    const depth = astDepth(ast);
    if (depth > MAX_AST_DEPTH) {
      return { ok: false, errors: [{ code: "E_AST_DEEP", message: `profondeur d'AST > ${MAX_AST_DEPTH}`, offset: 0, length: source.length }] };
    }
    return { ok: true, ast };
  } catch (e) {
    const err = e as ParseError;
    return { ok: false, errors: [{ code: "E_PARSE", message: err.message, offset: err.offset ?? 0, length: 1 }] };
  }
}

function astDepth(node: Node): number {
  switch (node.t) {
    case "lit":
    case "id":
      return 1;
    case "get":
      return 1 + astDepth(node.obj);
    case "index":
      return 1 + Math.max(astDepth(node.obj), astDepth(node.idx));
    case "un":
      return 1 + astDepth(node.a);
    case "bin":
      return 1 + Math.max(astDepth(node.a), astDepth(node.b));
    case "call":
      return 1 + node.args.reduce((m, a) => Math.max(m, astDepth(a)), 0);
  }
}

// ── Analyse statique (A.7, A.10) ─────────────────────────────────────────────

const LAZY_FNS = new Set(["filter", "sort", "unique", "groupBy"]);

/**
 * Verifie la portee, les fonctions connues, les arites et les proprietes
 * interdites. Rend une liste de diagnostics (vide = OK). scope est l'ensemble
 * des identifiants autorises dans ce champ.
 */
export function analyze(ast: Node, scope: Set<string>, opts?: CompileOptions): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const fns = { ...BASE_FNS, ...(opts?.functions ?? {}) };
  const arity = { ...BASE_ARITY, ...(opts?.arities ?? {}) };
  const walk = (node: Node, vars: Set<string>): void => {
    switch (node.t) {
      case "lit":
        return;
      case "id":
        if (!vars.has(node.name)) {
          errors.push({
            code: "E_UNKNOWN_IDENT",
            message: `${node.name} inconnu dans cette portee`,
            offset: 0,
            length: node.name.length,
          });
        }
        return;
      case "get":
        if (FORBIDDEN_PROPS.has(node.key)) {
          errors.push({ code: "E_FORBIDDEN_PROP", message: `propriete ${node.key} interdite`, offset: 0, length: node.key.length });
        }
        walk(node.obj, vars);
        return;
      case "index":
        walk(node.obj, vars);
        walk(node.idx, vars);
        return;
      case "un":
        walk(node.a, vars);
        return;
      case "bin":
        if ("+-*/%".includes(node.op)) {
          if (node.a.t === "lit" && typeof node.a.v === "string") {
            errors.push({ code: "E_TYPE", message: `${node.op} attend des nombres (chaine a gauche)`, offset: 0, length: 1 });
          }
          if (node.b.t === "lit" && typeof node.b.v === "string") {
            errors.push({ code: "E_TYPE", message: `${node.op} attend des nombres (chaine a droite)`, offset: 0, length: 1 });
          }
        }
        walk(node.a, vars);
        walk(node.b, vars);
        return;
      case "call": {
        if (!Object.prototype.hasOwnProperty.call(fns, node.name)) {
          errors.push({ code: "E_UNKNOWN_FN", message: `fonction ${node.name} inconnue`, offset: 0, length: node.name.length });
          return;
        }
        const [min, max] = arity[node.name] ?? [0, 0];
        if (node.args.length < min || node.args.length > max) {
          errors.push({
            code: "E_ARITY",
            message: `${node.name} attend ${min === max ? min : `${min}-${max}`} arguments, ${node.args.length} fournis`,
            offset: 0,
            length: node.name.length,
          });
        }
        const childVars = LAZY_FNS.has(node.name) ? new Set([...vars, "it"]) : vars;
        for (const arg of node.args) walk(arg, childVars);
        return;
      }
    }
  };
  walk(ast, new Set(scope));
  return errors;
}

// ── Evaluateur (A.5, A.9) ────────────────────────────────────────────────────

const truthy = (v: Value): boolean =>
  !(v === null || v === false || v === 0 || (typeof v === "number" && Number.isNaN(v)) || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0));

const num = (v: Value): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function compare(op: string, a: Value, b: Value, depth: number): Value {
  if (op === "in") {
    if (Array.isArray(b)) return b.some((x) => deepEqual(x, a, depth));
    if (typeof b === "string" && typeof a === "string") return b.includes(a);
    if (typeof b === "object" && b !== null && !Array.isArray(b) && typeof a === "string") return Object.prototype.hasOwnProperty.call(b, a);
    return false;
  }
  if (op === "==") return deepEqual(a, b, depth);
  if (op === "!=") return !deepEqual(a, b, depth);
  if (a === null || b === null) return null;
  if (typeof a === "number" && typeof b === "number") {
    if (op === "<") return a < b;
    if (op === "<=") return a <= b;
    if (op === ">") return a > b;
    return a >= b;
  }
  if (typeof a === "string" && typeof b === "string") {
    if (op === "<") return a < b;
    if (op === "<=") return a <= b;
    if (op === ">") return a > b;
    return a >= b;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    const av = a ? 1 : 0;
    const bv = b ? 1 : 0;
    if (op === "<") return av < bv;
    if (op === "<=") return av <= bv;
    if (op === ">") return av > bv;
    return av >= bv;
  }
  return null;
}

function deepEqual(a: Value, b: Value, depth: number): boolean {
  if (depth > MAX_CMP_DEPTH) return false;
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => deepEqual(x, b[i]!, depth + 1));
  }
  if (typeof a === "object" && a !== null && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    const ak = Object.keys(a);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual((a as Record<string, Value>)[k]!, (b as Record<string, Value>)[k]!, depth + 1));
  }
  return false;
}

function arith(op: string, a: Value, b: Value): Value {
  const x = num(a);
  const y = num(b);
  if (x === null || y === null) return null;
  if ((op === "/" || op === "%") && y === 0) return null;
  if (op === "+") return x + y;
  if (op === "-") return x - y;
  if (op === "*") return x * y;
  if (op === "/") return x / y;
  return x % y;
}

function readKey(obj: Value, key: string): Value {
  if (FORBIDDEN_PROPS.has(key)) return null;
  if (obj === null || typeof obj !== "object") return null;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return null;
  const v = (obj as Record<string, Value>)[key];
  return v === undefined ? null : v;
}

function readIndex(obj: Value, idx: Value): Value {
  if (Array.isArray(obj) && typeof idx === "number") {
    const v = obj[idx];
    return v === undefined ? null : v;
  }
  if (typeof obj === "string" && typeof idx === "number") return obj[idx] ?? null;
  if (typeof obj === "object" && obj !== null && !Array.isArray(obj) && typeof idx === "string") return readKey(obj, idx);
  return null;
}

function evalNode(node: Node, vars: Record<string, Value>, st: EvalState): Value {
  st.steps -= 1;
  if (st.steps < 0) {
    if (!st.warnings.includes("budget d'evaluation epuise")) st.warnings.push("budget d'evaluation epuise");
    return null;
  }
  try {
    switch (node.t) {
      case "lit":
        return node.v;
      case "id":
        if (FORBIDDEN_PROPS.has(node.name)) return null;
        return vars[node.name] ?? null;
      case "get": {
        const obj = evalNode(node.obj, vars, st);
        if (FORBIDDEN_PROPS.has(node.key)) return null;
        return readKey(obj, node.key);
      }
      case "index": {
        const obj = evalNode(node.obj, vars, st);
        const idx = evalNode(node.idx, vars, st);
        return readIndex(obj, idx);
      }
      case "un": {
        if (node.op === "not") return !truthy(evalNode(node.a, vars, st));
        const v = num(evalNode(node.a, vars, st));
        return v === null ? null : -v;
      }
      case "bin": {
        if (node.op === "and") return truthy(evalNode(node.a, vars, st)) ? truthy(evalNode(node.b, vars, st)) : false;
        if (node.op === "or") return truthy(evalNode(node.a, vars, st)) ? true : truthy(evalNode(node.b, vars, st));
        const a = evalNode(node.a, vars, st);
        const b = evalNode(node.b, vars, st);
        if ("+-*/%".includes(node.op)) return arith(node.op, a, b);
        return compare(node.op, a, b, 0);
      }
      case "call": {
        const fn = st.functions[node.name];
        if (!fn) return null;
        return fn(node.args, vars, st);
      }
    }
  } catch {
    return null;
  }
}

/** Evalue un AST. Ne leve jamais : rend null et accumule des avertissements. */
export function evaluate(ast: Node, ctx: EvalContext, opts?: CompileOptions): { value: Value; warnings: string[] } {
  const warnings: string[] = [];
  const st: EvalState = {
    vars: ctx,
    steps: MAX_STEPS,
    warnings,
    functions: { ...BASE_FNS, ...(opts?.functions ?? {}) },
  };
  return { value: evalNode(ast, ctx, st), warnings };
}

// ── Fonctions de base (table close, A.8) ────────────────────────────────────

function buildBaseFns(): Record<string, FnImpl> {
  const ev = (n: Node | undefined, vars: Record<string, Value>, st: EvalState): Value =>
    n ? evalNode(n, vars, st) : null;

  const asList = (v: Value): Value[] | null => (Array.isArray(v) ? v : null);

  const valueList = (v: Value): Value[] => {
    const l = asList(v);
    if (!l) return [];
    return l.length > MAX_LIST ? l : l.slice(0, MAX_LIST);
  };

  const readPath = (obj: Value, path: string): Value => {
    let cur: Value = obj;
    for (const seg of path.split(".")) {
      cur = readKey(cur, seg);
      if (cur === null) return null;
    }
    return cur;
  };

  const order = (a: Value, b: Value): number => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    if (typeof a === "boolean" && typeof b === "boolean") return (a ? 1 : 0) - (b ? 1 : 0);
    return 0;
  };

  const langOf = (vars: Record<string, Value>): string => {
    const l = vars.lang;
    return typeof l === "string" && l ? l : "fr";
  };

  return {
    __list: (args, vars, st) => args.map((a) => ev(a, vars, st)),
    count: (args, vars, st) => {
      const l = asList(ev(args[0], vars, st));
      return l ? l.length : 0;
    },
    sum: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1] ? ev(args[1], vars, st) : undefined;
      let total = 0;
      for (const item of l) {
        const n = num(key === undefined || key === null ? item : readKey(item, String(key)));
        if (n !== null) total += n;
      }
      return l.length ? total : null;
    },
    avg: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1] ? ev(args[1], vars, st) : undefined;
      if (!l.length) return null;
      let total = 0;
      let count = 0;
      for (const item of l) {
        const n = num(key === undefined || key === null ? item : readKey(item, String(key)));
        if (n !== null) {
          total += n;
          count += 1;
        }
      }
      return count ? total / count : null;
    },
    min: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1] ? ev(args[1], vars, st) : undefined;
      const ns = l
        .map((it) => num(key === undefined || key === null ? it : readKey(it, String(key))))
        .filter((x): x is number => x !== null);
      return ns.length ? Math.min(...ns) : null;
    },
    max: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1] ? ev(args[1], vars, st) : undefined;
      const ns = l
        .map((it) => num(key === undefined || key === null ? it : readKey(it, String(key))))
        .filter((x): x is number => x !== null);
      return ns.length ? Math.max(...ns) : null;
    },
    first: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      return l.length ? l[0]! : null;
    },
    last: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      return l.length ? l[l.length - 1]! : null;
    },
    take: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const n = num(ev(args[1], vars, st));
      if (n === null) return null;
      return l.slice(0, n);
    },
    filter: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const pred = args[1];
      if (!pred) return null;
      return l.filter((it) => truthy(evalNode(pred, { ...vars, it }, st)));
    },
    sort: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1];
      const arr = [...l];
      arr.sort((x, y) => {
        const kx = key ? ev(key, { ...vars, it: x }, st) : x;
        const ky = key ? ev(key, { ...vars, it: y }, st) : y;
        return order(kx, ky);
      });
      return arr;
    },
    reverse: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      return [...l].reverse();
    },
    unique: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1];
      const seen = new Set<string>();
      const out: Value[] = [];
      for (const it of l) {
        const k = key ? JSON.stringify(ev(key, { ...vars, it }, st)) : JSON.stringify(it);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(it);
      }
      return out;
    },
    groupBy: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const key = args[1];
      if (!key) return null;
      const map = new Map<string, Value[]>();
      for (const it of l) {
        const k = JSON.stringify(ev(key, { ...vars, it }, st));
        const bucket = map.get(k);
        if (bucket) bucket.push(it);
        else map.set(k, [it]);
      }
      return [...map.entries()].map(([k, items]) => ({ key: k, items }));
    },
    pluck: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const path = ev(args[1], vars, st);
      if (typeof path !== "string") return null;
      return l.map((it) => readPath(it, path));
    },
    flatten: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const out: Value[] = [];
      for (const it of l) if (Array.isArray(it)) out.push(...it);
      return out;
    },
    join: (args, vars, st) => {
      const l = valueList(ev(args[0], vars, st));
      const sep = ev(args[1], vars, st);
      return l.map((x) => String(x)).join(typeof sep === "string" ? sep : ", ");
    },
    upper: (args, vars, st) => {
      const v = ev(args[0], vars, st);
      return typeof v === "string" ? v.toUpperCase() : null;
    },
    lower: (args, vars, st) => {
      const v = ev(args[0], vars, st);
      return typeof v === "string" ? v.toLowerCase() : null;
    },
    trim: (args, vars, st) => {
      const v = ev(args[0], vars, st);
      return typeof v === "string" ? v.trim() : null;
    },
    truncate: (args, vars, st) => {
      const v = ev(args[0], vars, st);
      const n = num(ev(args[1], vars, st));
      if (typeof v !== "string" || n === null) return null;
      if (v.length <= n) return v;
      const suffix = ev(args[2], vars, st);
      return v.slice(0, n) + (typeof suffix === "string" ? suffix : "...");
    },
    contains: (args, vars, st) => {
      const a = ev(args[0], vars, st);
      const b = ev(args[1], vars, st);
      return typeof a === "string" && typeof b === "string" ? a.includes(b) : false;
    },
    startsWith: (args, vars, st) => {
      const a = ev(args[0], vars, st);
      const b = ev(args[1], vars, st);
      return typeof a === "string" && typeof b === "string" ? a.startsWith(b) : false;
    },
    endsWith: (args, vars, st) => {
      const a = ev(args[0], vars, st);
      const b = ev(args[1], vars, st);
      return typeof a === "string" && typeof b === "string" ? a.endsWith(b) : false;
    },
    replace: (args, vars, st) => {
      const a = ev(args[0], vars, st);
      const b = ev(args[1], vars, st);
      const c = ev(args[2], vars, st);
      if (typeof a !== "string" || typeof b !== "string" || typeof c !== "string") return null;
      return a.split(b).join(c);
    },
    round: (args, vars, st) => {
      const v = num(ev(args[0], vars, st));
      const d = num(ev(args[1], vars, st)) ?? 0;
      if (v === null) return null;
      const f = 10 ** d;
      return Math.round(v * f) / f;
    },
    percent: (args, vars, st) => {
      const part = num(ev(args[0], vars, st));
      const total = num(ev(args[1], vars, st)) ?? 100;
      if (part === null || total === 0) return null;
      return Math.round((part / total) * 100);
    },
    abs: (args, vars, st) => {
      const v = num(ev(args[0], vars, st));
      return v === null ? null : Math.abs(v);
    },
    clamp: (args, vars, st) => {
      const v = num(ev(args[0], vars, st));
      const lo = num(ev(args[1], vars, st));
      const hi = num(ev(args[2], vars, st));
      if (v === null || lo === null || hi === null) return null;
      return Math.min(Math.max(v, lo), hi);
    },
    duration: (args, vars, st) => {
      const m = num(ev(args[0], vars, st));
      if (m === null || m <= 0) return "-";
      const h = Math.floor(m / 60);
      const rest = Math.round(m % 60);
      return h ? `${h} h ${String(rest).padStart(2, "0")}` : `${rest} min`;
    },
    date: (args, vars, st) => {
      const iso = ev(args[0], vars, st);
      if (typeof iso !== "string" || !iso) return null;
      const style = ev(args[1], vars, st);
      const lang = langOf(vars);
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        if (style === "iso") return d.toISOString().slice(0, 10);
        if (style === "relative") {
          const now = vars.now;
          const base = typeof now === "string" ? new Date(now) : new Date();
          const days = Math.round((base.getTime() - d.getTime()) / 86_400_000);
          if (days === 0) return "aujourd'hui";
          if (days === 1) return "hier";
          if (days === -1) return "demain";
          return days > 0 ? `il y a ${days} j` : `dans ${Math.abs(days)} j`;
        }
        const opt: Intl.DateTimeFormatOptions =
          style === "long" ? { dateStyle: "long" } : { day: "2-digit", month: "short" };
        return new Intl.DateTimeFormat(lang, opt).format(d);
      } catch {
        return null;
      }
    },
    days: (args, vars, st) => {
      const iso = ev(args[0], vars, st);
      const from = ev(args[1], vars, st) ?? vars.now;
      if (typeof iso !== "string" || !iso) return null;
      const a = new Date(iso).getTime();
      const b = typeof from === "string" && from ? new Date(from).getTime() : Date.now();
      if (Number.isNaN(a) || Number.isNaN(b)) return null;
      return Math.round((a - b) / 86_400_000);
    },
    overdue: (args, vars, st) => {
      const iso = ev(args[0], vars, st);
      const now = vars.now;
      if (typeof iso !== "string" || !iso || typeof now !== "string") return false;
      return iso < now;
    },
    age: (args, vars, st) => {
      const iso = ev(args[0], vars, st);
      if (typeof iso !== "string" || !iso) return null;
      const a = new Date(iso).getTime();
      if (Number.isNaN(a)) return null;
      const now = ev(args[1], vars, st) ?? vars.now;
      const b = typeof now === "string" && now ? new Date(now).getTime() : Date.now();
      if (Number.isNaN(b)) return null;
      return Math.round((b - a) / 86_400_000);
    },
    default: (args, vars, st) => {
      const v = ev(args[0], vars, st);
      return truthy(v) ? v : ev(args[1], vars, st);
    },
    coalesce: (args, vars, st) => {
      for (const a of args) {
        const v = ev(a, vars, st);
        if (truthy(v)) return v;
      }
      return null;
    },
    if: (args, vars, st) => {
      const cond = args[0];
      const a = args[1];
      const b = args[2];
      if (!cond || !a) return null;
      return truthy(ev(cond, vars, st)) ? ev(a, vars, st) : b ? ev(b, vars, st) : null;
    },
  };
}

// ── Compilation memoisee (A.11) ──────────────────────────────────────────────

export type Compiled =
  | { ok: true; ast: Node; analyzeErrors: Diagnostic[]; evaluate: (ctx: EvalContext) => { value: Value; warnings: string[] } }
  | { ok: false; errors: Diagnostic[] };

const cache = new Map<string, Compiled>();
const CACHE_MAX = 500;

/**
 * Analyse + valide en une fois, memoise par (source, portee, tag). Rend les
 * diagnostics d'analyse sans lever ; l'evaluation reste sure meme sur un AST
 * issu d'une source invalide (mais on ne devrait pas l'appeler dans ce cas).
 */
export function compile(source: string, scope: Set<string>, opts?: CompileOptions): Compiled {
  const tag = opts?.tag ?? "base";
  const key = `${tag} ${source} ${[...scope].sort().join(",")}`;
  const hit = cache.get(key);
  if (hit) {
    if (cache.size > CACHE_MAX) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
    return hit;
  }
  const parsed = parse(source);
  let compiled: Compiled;
  if (!parsed.ok) {
    compiled = { ok: false, errors: parsed.errors };
  } else {
    const analyzeErrors = analyze(parsed.ast, scope, opts);
    compiled = {
      ok: true,
      ast: parsed.ast,
      analyzeErrors,
      evaluate: (ctx: EvalContext) => evaluate(parsed.ast, ctx, opts),
    };
  }
  cache.set(key, compiled);
  return compiled;
}

/** Raccourci source -> valeur, pour un appel ponctuel (sans cache). */
export function run(source: string, ctx: EvalContext, opts?: CompileOptions): Value {
  const res = parse(source);
  if (!res.ok) return null;
  return evaluate(res.ast, ctx, opts).value;
}

// ── Portees predefinies (A.7) ────────────────────────────────────────────────

const TASK_FIELDS = [
  "id", "titre", "projet", "statut", "statutLabel", "statutColor", "weight",
  "priorite", "prioriteLabel", "prioriteColor", "assigne", "dateDebut",
  "echeance", "archived", "done", "minutes",
];

const withBase = (extra: string[]): Set<string> => new Set([...TASK_FIELDS, "now", "lang", "settings", "doc", "tasks", ...extra]);

export const SCOPE = {
  /** where, sort, group (source tasks). */
  tasks: withBase([]),
  /** layout.columns[].value en mode plat. */
  flatColumn: withBase(["task"]),
  /** layout.columns[].value en mode groupe (group + items). */
  groupedColumn: withBase(["group", "items"]),
  /** Pied de tableau. */
  footer: withBase(["group", "items"]),
  /** when d'une commande. */
  commandWhen: new Set(["view", "doc", "selection", "settings", "now", "lang"]),
  /** value d'une colonne contribuee. */
  contributedColumn: new Set(["task", "refs", "now", "lang", "settings"]),
};

export const FORBIDDEN = FORBIDDEN_PROPS;
export const KEYWORDS_SET = KEYWORDS;
