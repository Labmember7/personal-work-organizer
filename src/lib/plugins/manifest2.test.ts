import { describe, it, expect } from "vitest";
import { parseManifestV2, satisfiesRange, PLUGIN_API_MAX } from "./manifest2";

const baseValid = JSON.stringify({
  format: "trk.extension/2",
  id: "charge",
  version: "1.0.0",
  publisher: "bzarai",
  engines: { api: 2, app: ">=2.0.0" },
  name: { fr: "Charge", en: "Load" },
  permissions: ["tasks:read", "capacite-inconnue"],
  contributes: {
    views: [{ id: "charge", kind: "declarative", spec: "views/charge.trkv" }],
  },
});

describe("manifest2 / satisfiesRange", () => {
  it("accepte les plages semver courantes", () => {
    expect(satisfiesRange(">=2.0.0", "2.0.0")).toBe(true);
    expect(satisfiesRange(">=2.0.0", "2.5.3")).toBe(true);
    expect(satisfiesRange("^2.0.0", "2.9.0")).toBe(true);
    expect(satisfiesRange("^2.0.0", "3.0.0")).toBe(false);
    expect(satisfiesRange("~2.1.0", "2.1.9")).toBe(true);
    expect(satisfiesRange("~2.1.0", "2.2.0")).toBe(false);
    expect(satisfiesRange(">=2.0.0 <3.0.0", "2.4.0")).toBe(true);
    expect(satisfiesRange(">=3.0.0 || <1.0.0", "2.0.0")).toBe(false);
    expect(satisfiesRange(">=3.0.0 || <1.0.0", "3.1.0")).toBe(true);
  });
});

describe("manifest2 / parseManifestV2", () => {
  it("valide un manifeste correct", () => {
    const r = parseManifestV2(baseValid, { appVersion: "2.0.0" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.manifest.id).toBe("charge");
      expect(r.manifest.permissions).toEqual(["tasks:read"]);
      expect(r.manifest.engines.api).toBe(2);
      expect(r.manifest.contributes?.views?.[0]?.id).toBe("charge");
    }
  });

  it("refuse un JSON illisible", () => {
    const r = parseManifestV2("{ pas du json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid-json");
  });

  it("refuse un format non v2", () => {
    const r = parseManifestV2(JSON.stringify({ format: "trk.extension/1", id: "x", version: "1", engines: { api: 1 }, name: "X" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not-v2");
  });

  it("refuse un id invalide", () => {
    const r = parseManifestV2(JSON.stringify({ format: "trk.extension/2", id: "Mauvais Id!", version: "1", engines: { api: 2 }, name: "X" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid-manifest");
  });

  it("refuse une api trop recente", () => {
    const r = parseManifestV2(JSON.stringify({ format: "trk.extension/2", id: "x", version: "1", engines: { api: PLUGIN_API_MAX + 1 }, name: "X" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("api-too-new");
  });

  it("refuse engines.app incompatible", () => {
    const m = { format: "trk.extension/2", id: "x", version: "1", engines: { api: 2, app: ">=3.0.0" }, name: "X" };
    const r = parseManifestV2(JSON.stringify(m), { appVersion: "2.0.0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("engine-mismatch");
  });

  it("accepte engines.app compatible sans appVersion fourni", () => {
    const m = { format: "trk.extension/2", id: "x", version: "1", engines: { api: 2, app: ">=3.0.0" }, name: "X" };
    const r = parseManifestV2(JSON.stringify(m));
    expect(r.ok).toBe(true);
  });

  it("signale une expression trkx invalide dans commands.when", () => {
    const m = {
      format: "trk.extension/2",
      id: "x",
      version: "1",
      engines: { api: 2 },
      name: "X",
      contributes: { commands: [{ id: "x.go", when: "bidule == 1" }] },
    };
    const r = parseManifestV2(JSON.stringify(m));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("invalid-manifest");
      expect(r.diagnostics?.some((d) => d.code === "E_UNKNOWN_IDENT")).toBe(true);
    }
  });

  it("valide taskColumns.value et signale une erreur", () => {
    const ok = {
      format: "trk.extension/2", id: "x", version: "1", engines: { api: 2 }, name: "X",
      contributes: { taskColumns: [{ id: "x.col", value: "count(refs)" }] },
    };
    expect(parseManifestV2(JSON.stringify(ok)).ok).toBe(true);

    const bad = {
      format: "trk.extension/2", id: "x", version: "1", engines: { api: 2 }, name: "X",
      contributes: { taskColumns: [{ id: "x.col", value: "somme(refs)" }] },
    };
    const r = parseManifestV2(JSON.stringify(bad));
    expect(r.ok).toBe(false);
  });
});
