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
});
