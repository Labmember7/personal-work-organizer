// Preuve de concept du langage `trkx` (spec complète : docs/plugins/trkx-langage.md).
//
// Périmètre volontairement réduit à ce que la démonstration exige : littéraux,
// chemins, appels, tube, booléens, comparaisons, arithmétique, et une table de
// fonctions courte. PAS d'analyse statique, PAS de budget de pas, PAS de cache,
// PAS de tests — ce fichier montre que l'approche tient, il n'est pas
// l'implémentation définitive.
//
// Les deux invariants qui comptent sont déjà là : aucun `eval` (l'AST est
// interprété par un switch) et aucune exception qui remonte (une expression
// fausse rend `null`).

import { prioOf, statusOf } from "../statuses";

export type Value = null | boolean | number | string | Value[] | { [k: string]: Value };

// ── Lexeur ─────────────────────────────────────────────────────────────────

interface Tok {
  k: "num" | "str" | "id" | "op";
  v: string;
}

const TOKEN_RE =
  /\s+|#[^\n]*|(\d+\.?\d*)|'([^']*)'|"([^"]*)"|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<=|>=|[-+*/%<>|(),.[\]])/g;

function lex(src: string): Tok[] | null {
  const out: Tok[] = [];
  TOKEN_RE.lastIndex = 0;
  let at = 0;
  for (let m = TOKEN_RE.exec(src); m; m = TOKEN_RE.exec(src)) {
    // Un caractère non reconnu laisserait un trou : on refuse la source
    // entière plutôt que d'évaluer une expression amputée.
    if (m.index !== at) return null;
    at = m.index + m[0].length;
    if (m[1] !== undefined) out.push({ k: "num", v: m[1] });
    else if (m[2] !== undefined) out.push({ k: "str", v: m[2] });
    else if (m[3] !== undefined) out.push({ k: "str", v: m[3] });
    else if (m[4] !== undefined) out.push({ k: "id", v: m[4] });
    else if (m[5] !== undefined) out.push({ k: "op", v: m[5] });
    // sinon : blanc ou commentaire, rien à empiler
  }
  return at === src.length ? out : null;
}

// ── AST ────────────────────────────────────────────────────────────────────

export type Node =
  | { t: "lit"; v: Value }
  | { t: "id"; name: string }
  | { t: "get"; obj: Node; key: string }
  | { t: "call"; name: string; args: Node[] }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node };

// ── Analyseur descendant récursif ──────────────────────────────────────────
// Une fonction par niveau de précédence, du plus lâche au plus serré :
// or < and < not < comparaison < +- < */% < tube < unaire < accès.

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok | undefined {
    return this.toks[this.i];
  }
  private isOp(v: string): boolean {
    const tok = this.peek();
    return tok?.k === "op" && tok.v === v;
  }
  private isId(v: string): boolean {
    const tok = this.peek();
    return tok?.k === "id" && tok.v === v;
  }
  private eat(): Tok {
    const tok = this.toks[this.i];
    if (!tok) throw new Error("fin d'expression inattendue");
    this.i += 1;
    return tok;
  }
  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new Error(`« ${v} » attendu`);
    this.i += 1;
  }

  parse(): Node {
    const node = this.or();
    if (this.i !== this.toks.length) throw new Error("jetons en trop");
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

  // Non associatif : `a < b < c` échoue au lieu de piéger silencieusement.
  private cmp(): Node {
    const a = this.add();
    const tok = this.peek();
    if (tok?.k === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(tok.v)) {
      this.i += 1;
      return { t: "bin", op: tok.v, a, b: this.add() };
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

  // `x | f(a)` se désucre exactement en `f(x, a)` : le tube n'est qu'une
  // écriture, il n'ajoute aucun mécanisme à l'évaluateur.
  private pipe(): Node {
    let a = this.unary();
    while (this.isOp("|")) {
      this.i += 1;
      const name = this.eat();
      if (name.k !== "id") throw new Error("nom de filtre attendu après |");
      const args: Node[] = [a];
      if (this.isOp("(")) {
        this.i += 1;
        while (!this.isOp(")")) {
          args.push(this.or());
          if (this.isOp(",")) this.i += 1;
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
    while (this.isOp(".")) {
      this.i += 1;
      const key = this.eat();
      if (key.k !== "id") throw new Error("nom de propriété attendu après .");
      a = { t: "get", obj: a, key: key.v };
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
    // Littéral de liste : sert surtout à `statut in ['revue', 'valider']`.
    if (tok.k === "op" && tok.v === "[") {
      const items: Node[] = [];
      while (!this.isOp("]")) {
        items.push(this.or());
        if (this.isOp(",")) this.i += 1;
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
        while (!this.isOp(")")) {
          args.push(this.or());
          if (this.isOp(",")) this.i += 1;
        }
        this.expectOp(")");
        return { t: "call", name: tok.v, args };
      }
      return { t: "id", name: tok.v };
    }
    throw new Error(`jeton inattendu « ${tok.v} »`);
  }
}

/** Analyse une source. Rend `null` si elle est invalide (jamais d'exception). */
export function parse(source: string): Node | null {
  const toks = lex(source);
  if (!toks || toks.length === 0) return null;
  try {
    return new Parser(toks).parse();
  } catch {
    return null;
  }
}

// ── Évaluateur ─────────────────────────────────────────────────────────────

export type Ctx = Record<string, Value>;

const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

const truthy = (v: Value): boolean =>
  !(v === null || v === false || v === 0 || v === "" || (Array.isArray(v) && v.length === 0));

const num = (v: Value): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function compare(op: string, a: Value, b: Value): Value {
  if (op === "==") return JSON.stringify(a) === JSON.stringify(b);
  if (op === "!=") return JSON.stringify(a) !== JSON.stringify(b);
  if (op === "in") {
    if (Array.isArray(b)) return b.some((x) => JSON.stringify(x) === JSON.stringify(a));
    if (typeof b === "string" && typeof a === "string") return b.includes(a);
    return false;
  }
  // Ordre : seulement entre valeurs de même type comparable, sinon null.
  if (typeof a !== typeof b || (typeof a !== "number" && typeof a !== "string")) return null;
  const cmp = a < (b as typeof a) ? -1 : a > (b as typeof a) ? 1 : 0;
  if (op === "<") return cmp < 0;
  if (op === "<=") return cmp <= 0;
  if (op === ">") return cmp > 0;
  return cmp >= 0;
}

function arith(op: string, a: Value, b: Value): Value {
  const x = num(a);
  const y = num(b);
  if (x === null || y === null) return null; // pas de concaténation implicite
  if (op === "+") return x + y;
  if (op === "-") return x - y;
  if (op === "*") return x * y;
  if (y === 0) return null; // division ou modulo par zéro
  return op === "/" ? x / y : x % y;
}

// Les formes paresseuses reçoivent l'AST de leur argument, pas sa valeur :
// c'est ce qui permet de lier `it` à chaque élément d'une liste.
function lazyCall(name: string, args: Node[], ctx: Ctx): { hit: boolean; value: Value } {
  const miss = { hit: false, value: null as Value };
  if (name === "if") {
    const [cond, a, b] = args;
    if (!cond || !a) return miss;
    return { hit: true, value: truthy(evaluate(cond, ctx)) ? evaluate(a, ctx) : b ? evaluate(b, ctx) : null };
  }
  if (name === "filter") {
    const [list, pred] = args;
    if (!list || !pred) return miss;
    const src = evaluate(list, ctx);
    if (!Array.isArray(src)) return { hit: true, value: [] };
    return { hit: true, value: src.filter((it) => truthy(evaluate(pred, { ...ctx, it }))) };
  }
  return miss;
}

const FNS: Record<string, (args: Value[], ctx: Ctx) => Value> = {
  __list: (a) => a, // littéral de liste, produit par l'analyseur
  count: (a) => (Array.isArray(a[0]) ? a[0].length : 0),

  // `sum(list, 'chemin')` : le second argument nomme le champ à extraire, ce
  // qui évite une lambda pour le cas de loin le plus fréquent.
  sum: (a) => reduceNums(a, (ns) => ns.reduce((s, n) => s + n, 0)),
  avg: (a) => reduceNums(a, (ns) => (ns.length ? ns.reduce((s, n) => s + n, 0) / ns.length : null)),
  min: (a) => reduceNums(a, (ns) => (ns.length ? Math.min(...ns) : null)),
  max: (a) => reduceNums(a, (ns) => (ns.length ? Math.max(...ns) : null)),

  round: (a) => {
    const n = num(a[0] ?? null);
    const d = num(a[1] ?? null) ?? 0;
    if (n === null) return null;
    const f = 10 ** d;
    return Math.round(n * f) / f;
  },

  duration: (a) => {
    const m = num(a[0] ?? null);
    if (m === null || m <= 0) return "—";
    const h = Math.floor(m / 60);
    const rest = Math.round(m % 60);
    return h ? `${h} h ${String(rest).padStart(2, "0")}` : `${rest} min`;
  },

  // `now` est injecté dans le contexte par l'hôte : l'évaluation reste pure
  // et deux rendus successifs donnent le même résultat.
  overdue: (a, ctx) => {
    const iso = a[0];
    const now = ctx.now;
    if (typeof iso !== "string" || !iso || typeof now !== "string") return false;
    return iso < now;
  },

  // Le référentiel de statuts reste côté hôte : un plugin ne le recopie jamais
  // et suit automatiquement une évolution de lib/statuses.ts.
  statusLabel: (a) => statusOf(typeof a[0] === "string" ? a[0] : undefined).label,
  statusColor: (a) => statusOf(typeof a[0] === "string" ? a[0] : undefined).color,
  prioLabel: (a) => prioOf(typeof a[0] === "string" ? a[0] : undefined).label,
  prioColor: (a) => prioOf(typeof a[0] === "string" ? a[0] : undefined).color,

  default: (a) => (truthy(a[0] ?? null) ? (a[0] ?? null) : (a[1] ?? null)),
  upper: (a) => (typeof a[0] === "string" ? a[0].toUpperCase() : null),
  lower: (a) => (typeof a[0] === "string" ? a[0].toLowerCase() : null),
  join: (a) => (Array.isArray(a[0]) ? a[0].map(String).join(typeof a[1] === "string" ? a[1] : ", ") : null),
  percent: (a) => {
    const part = num(a[0] ?? null);
    const total = num(a[1] ?? null) ?? 100;
    return part === null || total === 0 ? null : Math.round((part / total) * 100);
  },
};

function reduceNums(args: Value[], fold: (ns: number[]) => number | null): Value {
  const list = args[0];
  if (!Array.isArray(list)) return null;
  const path = typeof args[1] === "string" ? args[1] : null;
  const ns: number[] = [];
  for (const item of list) {
    const raw = path ? readPath(item, path) : item;
    const n = num(raw);
    if (n !== null) ns.push(n);
  }
  return fold(ns);
}

function readPath(obj: Value, path: string): Value {
  let cur: Value = obj;
  for (const seg of path.split(".")) {
    cur = readKey(cur, seg);
    if (cur === null) return null;
  }
  return cur;
}

// Propriétés propres uniquement : ni prototype, ni accesseur hérité.
function readKey(obj: Value, key: string): Value {
  if (FORBIDDEN.has(key)) return null;
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return null;
  const v = obj[key];
  return v === undefined ? null : v;
}

/** Évalue un AST. Ne lève jamais : une expression fausse rend `null`. */
export function evaluate(node: Node, ctx: Ctx): Value {
  try {
    switch (node.t) {
      case "lit":
        return node.v;
      case "id": {
        if (FORBIDDEN.has(node.name)) return null;
        const v = ctx[node.name];
        return v === undefined ? null : v;
      }
      case "get":
        return readKey(evaluate(node.obj, ctx), node.key);
      case "un": {
        if (node.op === "not") return !truthy(evaluate(node.a, ctx));
        const n = num(evaluate(node.a, ctx));
        return n === null ? null : -n;
      }
      case "bin": {
        if (node.op === "and") return truthy(evaluate(node.a, ctx)) ? truthy(evaluate(node.b, ctx)) : false;
        if (node.op === "or") return truthy(evaluate(node.a, ctx)) ? true : truthy(evaluate(node.b, ctx));
        const a = evaluate(node.a, ctx);
        const b = evaluate(node.b, ctx);
        if ("+-*/%".includes(node.op)) return arith(node.op, a, b);
        return compare(node.op, a, b);
      }
      case "call": {
        const lazy = lazyCall(node.name, node.args, ctx);
        if (lazy.hit) return lazy.value;
        const fn = FNS[node.name];
        if (!fn) return null; // fonction inconnue : la spec complète la refuse à l'analyse
        return fn(
          node.args.map((a) => evaluate(a, ctx)),
          ctx,
        );
      }
    }
  } catch {
    return null;
  }
}

/** Raccourci source -> valeur, pour un appel ponctuel. */
export function run(source: string, ctx: Ctx): Value {
  const ast = parse(source);
  return ast ? evaluate(ast, ctx) : null;
}
