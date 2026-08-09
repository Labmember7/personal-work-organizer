import { describe, it, expect } from "vitest";
import { applyPatch, createDocument, docMatchesScope, docStorageKey, normalizeDocument, parseDocKey, summaryOf } from "./document";

describe("docStorageKey / parseDocKey", () => {
  it("construit puis retrouve pluginId et docId", () => {
    const key = docStorageKey("mindmap", "abc-123");
    expect(key).toBe("plugin-doc:mindmap:abc-123");
    expect(parseDocKey(key)).toEqual({ pluginId: "mindmap", docId: "abc-123" });
  });

  it("rend null pour une clé qui n'a pas le bon préfixe ou est incomplète", () => {
    expect(parseDocKey("autre-chose:mindmap:abc")).toBeNull();
    expect(parseDocKey("plugin-doc:mindmap")).toBeNull();
    expect(parseDocKey("plugin-doc::abc")).toBeNull();
  });
});

describe("createDocument", () => {
  it("rend une enveloppe conforme", () => {
    const doc = createDocument({
      pluginId: "mindmap",
      title: "Feuille de route",
      scope: { kind: "global" },
      dataVersion: 1,
      data: { root: null },
    });
    expect(doc.schema).toBe("trk.plugin.doc/1");
    expect(doc.pluginId).toBe("mindmap");
    expect(doc.title).toBe("Feuille de route");
    expect(doc.refs).toEqual([]);
    expect(doc.id).toBeTruthy();
    expect(doc.createdAt).toBe(doc.updatedAt);
  });
});

describe("normalizeDocument", () => {
  it("répare un document tronqué", () => {
    const doc = normalizeDocument({ title: "X", data: { a: 1 } }, "mindmap");
    expect(doc).not.toBeNull();
    expect(doc?.pluginId).toBe("mindmap");
    expect(doc?.scope).toEqual({ kind: "global" });
    expect(doc?.refs).toEqual([]);
    expect(doc?.dataVersion).toBe(1);
    expect(doc?.data).toEqual({ a: 1 });
  });

  it("refuse un pluginId étranger", () => {
    expect(normalizeDocument({ pluginId: "autre-plugin", title: "X", data: {} }, "mindmap")).toBeNull();
  });

  it("refuse une valeur qui n'est pas un objet", () => {
    expect(normalizeDocument("pas un objet", "mindmap")).toBeNull();
    expect(normalizeDocument(null, "mindmap")).toBeNull();
  });

  it("dédoublonne les refs par (kind, id)", () => {
    const doc = normalizeDocument(
      { data: {}, refs: [{ kind: "task", id: "t1" }, { kind: "task", id: "t1" }, { kind: "project", id: "p1" }] },
      "mindmap",
    );
    expect(doc?.refs).toEqual([{ kind: "task", id: "t1" }, { kind: "project", id: "p1" }]);
  });
});

describe("applyPatch", () => {
  it("met à jour updatedAt et conserve createdAt", () => {
    const doc = createDocument({ pluginId: "mindmap", title: "X", scope: { kind: "global" }, dataVersion: 1, data: {} });
    const patched = applyPatch(doc, { data: { a: 1 } });
    expect(patched.createdAt).toBe(doc.createdAt);
    expect(patched.data).toEqual({ a: 1 });
    expect(new Date(patched.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(doc.updatedAt).getTime());
  });

  it("ignore un titre vide", () => {
    const doc = createDocument({ pluginId: "mindmap", title: "Titre initial", scope: { kind: "global" }, dataVersion: 1, data: {} });
    const patched = applyPatch(doc, { data: {}, title: "   " });
    expect(patched.title).toBe("Titre initial");
  });

  it("remplace les refs quand fournies", () => {
    const doc = createDocument({ pluginId: "mindmap", title: "X", scope: { kind: "global" }, dataVersion: 1, data: {} });
    const patched = applyPatch(doc, { data: {}, refs: [{ kind: "task", id: "t1" }] });
    expect(patched.refs).toEqual([{ kind: "task", id: "t1" }]);
  });
});

describe("summaryOf / docMatchesScope", () => {
  it("projette les champs de liste", () => {
    const doc = createDocument({ pluginId: "mindmap", title: "X", scope: { kind: "project", project: "Acme" }, dataVersion: 1, data: {} });
    expect(summaryOf(doc)).toEqual({
      id: doc.id,
      pluginId: "mindmap",
      title: "X",
      scope: { kind: "project", project: "Acme" },
      updatedAt: doc.updatedAt,
      refCount: 0,
    });
  });

  it("filtre par portée", () => {
    const global = createDocument({ pluginId: "mindmap", title: "G", scope: { kind: "global" }, dataVersion: 1, data: {} });
    const scoped = createDocument({ pluginId: "mindmap", title: "P", scope: { kind: "project", project: "Acme" }, dataVersion: 1, data: {} });
    expect(docMatchesScope(global, null)).toBe(true);
    expect(docMatchesScope(scoped, null)).toBe(false);
    expect(docMatchesScope(scoped, "Acme")).toBe(true);
    expect(docMatchesScope(scoped, "Autre")).toBe(false);
  });
});
