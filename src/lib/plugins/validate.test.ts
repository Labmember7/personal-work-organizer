import { describe, it, expect } from "vitest";
import { validatePluginFolder, type ReadFile, type Exists } from "./validate";

function memFS(files: Record<string, string>): { read: ReadFile; exists: Exists } {
  return {
    read: (rel) => (rel in files ? (files[rel] ?? null) : null),
    exists: (rel) => rel in files,
  };
}

const VALID_MANIFEST = JSON.stringify({
  format: "trk.extension/2",
  id: "demo",
  version: "1.0.0",
  engines: { api: 2 },
  name: { fr: "Démo", en: "Demo" },
  description: { fr: "Démo", en: "Demo" },
  permissions: ["settings", "commands"],
  contributes: {
    views: [{ id: "main", title: { fr: "Vue", en: "View" }, kind: "declarative", spec: "views/main.trkv" }],
    commands: [{ id: "demo.hello", title: { fr: "Bonjour", en: "Hello" }, when: "view == 'board'" }],
    taskColumns: [{ id: "demo.minutes", label: { fr: "Minutes", en: "Minutes" }, value: "task.minutes", as: "badge" }],
    taskPanels: [{ id: "demo.related", title: { fr: "Liés", en: "Related" }, kind: "declarative", spec: "views/related.trkv" }],
    settings: { "demo.greet": { type: "boolean", default: false, label: { fr: "Saluer", en: "Greet" } } },
  },
});

const VALID_VIEW = JSON.stringify({
  spec: "trk.view/1",
  layout: { type: "table", columns: [{ value: "titre" }, { value: "minutes", as: "badge" }] },
});

describe("validatePluginFolder", () => {
  it("valide un plugin complet correct", () => {
    const fs = memFS({
      "manifest.json": VALID_MANIFEST,
      "views/main.trkv": VALID_VIEW,
      "views/related.trkv": VALID_VIEW,
    });
    const res = validatePluginFolder("plugins/demo", fs.read, fs.exists);
    expect(res.ok).toBe(true);
    expect(res.diagnostics).toHaveLength(0);
  });

  it("signale un manifeste absent", () => {
    const fs = memFS({});
    const res = validatePluginFolder("plugins/x", fs.read, fs.exists);
    expect(res.ok).toBe(false);
    expect(res.diagnostics.some((d) => d.code === "E_NO_MANIFEST")).toBe(true);
  });

  it("signale une expression trkx invalide dans le manifeste", () => {
    const bad = JSON.parse(VALID_MANIFEST);
    bad.contributes.commands[0].when = "view ==";
    const fs = memFS({ "manifest.json": JSON.stringify(bad) });
    const res = validatePluginFolder("plugins/x", fs.read, fs.exists);
    expect(res.ok).toBe(false);
    expect(res.diagnostics.some((d) => d.code === "E_TRKX" || d.code === "E_PARSE")).toBe(true);
  });

  it("signale une locale par defaut manquante", () => {
    const bad = JSON.parse(VALID_MANIFEST);
    bad.name = { es: "Demo" };
    const fs = memFS({
      "manifest.json": JSON.stringify(bad),
      "views/main.trkv": VALID_VIEW,
      "views/related.trkv": VALID_VIEW,
    });
    const res = validatePluginFolder("plugins/x", fs.read, fs.exists);
    expect(res.diagnostics.some((d) => d.code === "E_LOCALE" && d.message.includes("name"))).toBe(true);
  });

  it("signale une ressource manquante et un chemin non autorise", () => {
    const bad = JSON.parse(VALID_MANIFEST);
    bad.contributes.views[0].spec = "../escape.trkv";
    const fs = memFS({
      "manifest.json": JSON.stringify(bad),
      "views/related.trkv": VALID_VIEW,
    });
    const res = validatePluginFolder("plugins/x", fs.read, fs.exists);
    expect(res.diagnostics.some((d) => d.code === "E_PATH")).toBe(true);
    // related.trkv existe mais main.trkv pointe vers l'exterieur ; verifions aussi un manquant simple
    const bad2 = JSON.parse(VALID_MANIFEST);
    bad2.contributes.views[0].spec = "views/ghost.trkv";
    const fs2 = memFS({
      "manifest.json": JSON.stringify(bad2),
      "views/related.trkv": VALID_VIEW,
    });
    const res2 = validatePluginFolder("plugins/x", fs2.read, fs2.exists);
    expect(res2.diagnostics.some((d) => d.code === "E_MISSING")).toBe(true);
  });

  it("valide la spec de vue déclarative référencée", () => {
    const badView = JSON.stringify({ spec: "trk.view/1", layout: { type: "table", columns: [{ value: "???" }] } });
    const fs = memFS({
      "manifest.json": VALID_MANIFEST,
      "views/main.trkv": badView,
      "views/related.trkv": VALID_VIEW,
    });
    const res = validatePluginFolder("plugins/x", fs.read, fs.exists);
    expect(res.diagnostics.some((d) => d.file === "views/main.trkv")).toBe(true);
  });
});
