import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { parseViewSpecText, validateViewSpec } from "./viewSpec";

const chargeTrkvPath = fileURLToPath(new URL("../../../plugins/charge/views/charge.trkv", import.meta.url));

describe("viewSpec / fichier reel plugins/charge", () => {
  const text = readFileSync(chargeTrkvPath, "utf8");
  const parsed = parseViewSpecText(text);
  expect(parsed.ok).toBe(true);

  it("valide la spec charge.trkv", () => {
    const r = validateViewSpec((parsed as { data: unknown }).data);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.spec.layout?.type).toBe("table");
      expect(r.spec.layout?.columns).toHaveLength(6);
      expect(r.spec.group).toBe("projet");
    }
  });
});

describe("viewSpec / validation", () => {
  it("refuse un spec different de trk.view/1", () => {
    const r = validateViewSpec({ spec: "trk.view/2" });
    expect(r.ok).toBe(false);
  });

  it("refuse un layout.type inconnu", () => {
    const r = validateViewSpec({ spec: "trk.view/1", layout: { type: "banane" } });
    expect(r.ok).toBe(false);
  });

  it("signale une expression where hors portee", () => {
    const r = validateViewSpec({ spec: "trk.view/1", where: "bidule == 1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics?.some((d) => d.code === "E_UNKNOWN_IDENT")).toBe(true);
  });

  it("signale une colonne dont value est une expression invalide", () => {
    const r = validateViewSpec({
      spec: "trk.view/1",
      layout: { type: "table", columns: [{ label: "X", value: "somme(tasks)" }] },
    });
    expect(r.ok).toBe(false);
  });

  it("valide une spec groupee avec sort sur items", () => {
    const r = validateViewSpec({
      spec: "trk.view/1",
      source: "tasks",
      where: "not archived",
      group: "projet",
      sort: "-sum(items, 'minutes')",
      layout: {
        type: "table",
        columns: [
          { label: { fr: "Projet", en: "Project" }, value: "group" },
          { label: { fr: "Pointé", en: "Logged" }, value: "sum(items, 'minutes') | duration", as: "text" },
        ],
        footer: [{ value: "count(tasks)", align: "right" }],
      },
    });
    expect(r.ok).toBe(true);
  });
});

describe("viewSpec / YAML minimal", () => {
  it("parse un .trkv en YAML", () => {
    const yaml = `spec: trk.view/1
source: tasks
where: not archived
group: projet
layout:
  type: table
  columns:
    - label: { fr: Projet, en: Project }
      value: group
`;
    const parsed = parseViewSpecText(yaml);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const r = validateViewSpec(parsed.data);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.spec.layout?.columns?.[0]?.value).toBe("group");
    }
  });
});
