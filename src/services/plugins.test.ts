import { describe, expect, it } from "vitest";
import { buildFromCandidates } from "./plugins";

const urlFor = (f: string) => `app-plugin://local/${f}`;

describe("buildFromCandidates (v2 app tier)", () => {
  it("résout l'entry d'une vue `app` en url d'iframe", () => {
    const manifest = JSON.stringify({
      format: "trk.extension/2",
      id: "demo",
      version: "1.0.0",
      engines: { api: 2 },
      name: "Demo",
      permissions: ["tasks:read"],
      contributes: { views: [{ id: "d", kind: "app", entry: "index.html" }] },
    });
    const { plugins, errors } = buildFromCandidates(
      [{ file: "demo/manifest.json", origin: "builtin", manifestJson: manifest }],
      urlFor,
    );
    expect(errors).toHaveLength(0);
    expect(plugins).toHaveLength(1);
    const p = plugins[0];
    expect(p).toBeDefined();
    if (!p) return;
    expect(p.format).toBe(2);
    expect(p.url).toBe("app-plugin://demo/index.html");
    expect(p.declarative).toBeUndefined();
  });

  it("préserve la vue déclarative et met une url d'origine", () => {
    const manifest = JSON.stringify({
      format: "trk.extension/2",
      id: "charge",
      version: "1.0.0",
      engines: { api: 2 },
      name: "Charge",
      permissions: ["tasks:read"],
      contributes: { views: [{ id: "c", kind: "declarative", spec: "views/charge.trkv" }] },
    });
    const spec = JSON.stringify({ spec: "trk.view/1", source: "tasks" });
    const { plugins } = buildFromCandidates(
      [{ file: "charge/manifest.json", origin: "builtin", manifestJson: manifest, specJson: spec }],
      urlFor,
    );
    const p = plugins[0];
    expect(p).toBeDefined();
    if (!p) return;
    expect(p.format).toBe(2);
    expect(p.url).toBe("app-plugin://charge/");
    expect(p.declarative).toBeDefined();
  });

  it("remonte les points de contribution (commands) sur le PluginManifest", () => {
    const manifest = JSON.stringify({
      format: "ne-importe-quoi", // ignoré : le discriminateur est `format` litéral v2
      id: "mindmap",
      version: "1.0.0",
      engines: { api: 2 },
      name: "Mindmap",
      permissions: ["commands", "toast"],
      contributes: {
        commands: [{ id: "mindmap.exportPng", title: "Exporter", icon: "Image", when: "view == 'board'" }],
        taskColumns: [{ id: "mindmap.node", label: "Nœud", value: "count(refs)" }],
      },
    });
    // Le discriminateur v2 est le littéral "trk.extension/2" : on le met ici.
    const v2 = manifest.replace('"ne-importe-quoi"', '"trk.extension/2"');
    const { plugins } = buildFromCandidates(
      [{ file: "mindmap/manifest.json", origin: "builtin", manifestJson: v2 }],
      urlFor,
    );
    const p = plugins[0];
    expect(p).toBeDefined();
    if (!p) return;
    expect(p.manifest.commands).toBeDefined();
    const cmd = p.manifest.commands?.[0];
    expect(cmd).toBeDefined();
    expect(cmd?.id).toBe("mindmap.exportPng");
    expect(p.manifest.taskColumns).toBeDefined();
    const col = p.manifest.taskColumns?.[0];
    expect(col).toBeDefined();
    expect(col?.id).toBe("mindmap.node");
  });
});
