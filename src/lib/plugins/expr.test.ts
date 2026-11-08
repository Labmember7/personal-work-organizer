import { describe, it, expect } from "vitest";
import {
  parse,
  analyze,
  compile,
  run,
  SCOPE,
  type Node,
} from "./expr";
import { run as runHost, evaluate as evalHost } from "./trkx";
import { statusOf } from "../statuses";

const ast = (src: string): Node => {
  const r = parse(src);
  if (!r.ok) throw new Error(`parse failed: ${src}`);
  return r.ast;
};

describe("expr / lexer + parser", () => {
  it("parse des litteraux et operateurs", () => {
    expect(parse("1 + 2 * 3").ok).toBe(true);
    expect(parse("'a' == 'a'").ok).toBe(true);
    expect(parse("not archived and done").ok).toBe(true);
    expect(parse("sum(items, 'minutes') | duration").ok).toBe(true);
  });

  it("refuse une comparaison chainee", () => {
    const r = parse("a < b < c");
    expect(r.ok).toBe(false);
  });

  it("refuse un caractere inattendu", () => {
    const r = parse("1 @ 2");
    expect(r.ok).toBe(false);
  });

  it("refuse une source trop longue", () => {
    const r = parse("x".repeat(5000));
    expect(r.ok).toBe(false);
  });
});

describe("expr / analyse statique", () => {
  it("signale un identifiant hors portee", () => {
    const errs = analyze(ast("bidule.machin"), SCOPE.tasks);
    expect(errs.some((e) => e.code === "E_UNKNOWN_IDENT")).toBe(true);
  });

  it("signale une fonction inconnue", () => {
    const errs = analyze(ast("somme(items)"), SCOPE.tasks);
    expect(errs.some((e) => e.code === "E_UNKNOWN_FN")).toBe(true);
  });

  it("signale une arite incorrecte", () => {
    const errs = analyze(ast("count()"), SCOPE.tasks);
    expect(errs.some((e) => e.code === "E_ARITY")).toBe(true);
  });

  it("signale une propriete interdite", () => {
    const errs = analyze(ast("x.constructor"), SCOPE.tasks);
    expect(errs.some((e) => e.code === "E_FORBIDDEN_PROP")).toBe(true);
  });

  it("autorise `it` dans un predicat de filter", () => {
    const errs = analyze(ast("count(filter(tasks, it.done))"), SCOPE.tasks);
    expect(errs).toHaveLength(0);
  });

  it("autorise les champs de projection en portee tasks", () => {
    expect(analyze(ast("statut == 'termine'"), SCOPE.tasks)).toHaveLength(0);
  });
});

describe("expr / evaluation", () => {
  const ctx: import("./expr").EvalContext = {
    now: "2026-08-10",
    lang: "fr",
    titre: "Refonte du portail",
    minutes: 200,
    statut: "en-cours",
    echeance: "2026-07-01",
    archived: false,
    done: false,
    assigne: "",
    weight: 50,
    projet: "web",
    items: [
      { done: true, minutes: 30, assigne: "a" },
      { done: false, minutes: 10, assigne: "b" },
      { done: true, minutes: 5, assigne: "a" },
    ],
    tasks: [],
  };

  it("arithmetique et comparaison", () => {
    expect(run("1 + 2 * 3", ctx)).toBe(7);
    expect(run("minutes > 100", ctx)).toBe(true);
    expect(run("'a' == 'a'", ctx)).toBe(true);
    expect(run("3 in [1, 2, 3]", ctx)).toBe(true);
  });

  it("duration localise les minutes (A.12)", () => {
    expect(run("minutes | duration", ctx)).toBe("3 h 20");
    expect(run("0 | duration", ctx)).toBe("-");
  });

  it("aggregats", () => {
    expect(run("sum(items, 'minutes')", ctx)).toBe(45);
    expect(run("avg(items, 'minutes')", ctx)).toBe(15);
    expect(run("count(items)", ctx)).toBe(3);
    expect(run("count(filter(items, it.done))", ctx)).toBe(2);
    expect(run("sum(tasks, 'minutes') | duration", { ...ctx, tasks: [{ minutes: 65 }] })).toBe("1 h 05");
  });

  it("groupBy rend une liste de groupes", () => {
    const r = run("groupBy(items, it.assigne)", ctx) as Array<{ key: string; items: unknown[] }>;
    expect(r).toHaveLength(2);
    expect(r[0]!.items).toHaveLength(2);
  });

  it("sort stable sur cle", () => {
    const r = run("sort(items, it.minutes) | count", ctx);
    expect(r).toBe(3);
  });

  it("overdue / days / age (A.12)", () => {
    expect(run("overdue(echeance) and not done", ctx)).toBe(true);
    expect(run("days(echeance)", ctx)).toBe(-40);
    expect(run("age(echeance)", ctx)).toBe(40);
  });

  it("string + defensif", () => {
    expect(run("titre | upper", ctx)).toBe("REFONTE DU PORTAIL");
    expect(run("assigne | default('Personne')", ctx)).toBe("Personne");
    expect(run("coalesce(null, '', 'x')", ctx)).toBe("x");
    expect(run("if(done, 'oui', 'non')", ctx)).toBe("non");
  });

  it("injection impossible : pas de fonction globale", () => {
    expect(run("constructor", ctx)).toBe(null);
  });

  it("ne leve jamais", () => {
    expect(run("1 / 0", ctx)).toBe(null);
    expect(run("this is not valid (", ctx)).toBe(null);
  });
});

describe("expr / compile memoise", () => {
  it("rend les erreurs d'analyse sans lever", () => {
    const c = compile("somme(x)", SCOPE.tasks);
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.analyzeErrors.length).toBeGreaterThan(0);
  });

  it("evalue a partir du cache", () => {
    const c = compile("minutes | duration", SCOPE.tasks);
    expect(c.ok).toBe(true);
    if (c.ok) {
      expect(c.analyzeErrors).toHaveLength(0);
      expect(c.evaluate({ minutes: 200 }).value).toBe("3 h 20");
    }
  });
});

describe("trkx / fonctions hote", () => {
  it("statusLabel resout via lib/statuses (A.12)", () => {
    expect(runHost("statut | statusLabel", { statut: "en-cours" })).toBe(statusOf("en-cours").label);
  });

  it("t resolve les locales du plugin", () => {
    const ctx = { locales: { late: "En retard" }, lang: "fr" };
    expect(runHost("t('late', 'Late')", ctx)).toBe("En retard");
    expect(runHost("t('missing', 'Defaut')", ctx)).toBe("Defaut");
  });

  it("evaluate historique rend une Value", () => {
    expect(evalHost(ast("1 + 1"), {})).toBe(2);
  });
});
