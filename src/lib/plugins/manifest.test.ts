import { describe, it, expect } from "vitest";
import { extractManifestBlock, hasCapability, localized, parseManifest, scopesOf } from "./manifest";

const html = (json: string) => `<!doctype html>
<html><head>
<script type="application/json" id="trk-plugin">
${json}
</script>
</head><body></body></html>`;

describe("extractManifestBlock", () => {
  it("extrait le JSON depuis un HTML réaliste", () => {
    const block = extractManifestBlock(html('{ "id": "mindmap" }'));
    expect(block).toBe('{ "id": "mindmap" }');
  });

  it("rend null si la balise est absente", () => {
    expect(extractManifestBlock("<html><body>rien ici</body></html>")).toBeNull();
  });

  it("rend null si le bloc est vide", () => {
    expect(extractManifestBlock(html(""))).toBeNull();
  });
});

const validManifest = {
  id: "mindmap",
  version: "1.0.0",
  apiVersion: 1,
  name: { fr: "Carte mentale", en: "Mind map" },
  capabilities: ["doc", "tasks:read", "task:reveal"],
};

describe("parseManifest", () => {
  it("accepte un manifeste valide", () => {
    const result = parseManifest(JSON.stringify(validManifest));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("mindmap");
      expect(result.manifest.capabilities).toEqual(["doc", "tasks:read", "task:reveal"]);
    }
  });

  it("refuse un id invalide", () => {
    const result = parseManifest(JSON.stringify({ ...validManifest, id: "Mind Map!" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-manifest");
  });

  it("refuse un name absent", () => {
    const { name: _name, ...rest } = validManifest;
    const result = parseManifest(JSON.stringify(rest));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid-manifest");
  });

  it("refuse une apiVersion trop récente", () => {
    const result = parseManifest(JSON.stringify({ ...validManifest, apiVersion: 999 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("api-too-new");
  });

  it("ignore une capacité inconnue sans échouer", () => {
    const result = parseManifest(JSON.stringify({ ...validManifest, capabilities: ["doc", "capacite-inconnue"] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.manifest.capabilities).toEqual(["doc"]);
  });

  it("refuse un JSON illisible", () => {
    const result = parseManifest("{ pas du json");
    expect(result.ok).toBe(false);
  });
});

describe("localized / scopesOf / hasCapability", () => {
  it("résout la langue courante avec repli fr puis en", () => {
    expect(localized({ fr: "Carte", en: "Map" }, "en")).toBe("Map");
    expect(localized({ fr: "Carte" }, "en")).toBe("Carte");
    expect(localized("Simple", "en")).toBe("Simple");
  });

  it("scopesOf rend les deux portées par défaut", () => {
    const result = parseManifest(JSON.stringify(validManifest));
    if (result.ok) expect(scopesOf(result.manifest)).toEqual(["global", "project"]);
  });

  it("hasCapability teste la présence exacte", () => {
    const result = parseManifest(JSON.stringify(validManifest));
    if (result.ok) {
      expect(hasCapability(result.manifest, "doc")).toBe(true);
      expect(hasCapability(result.manifest, "file:save")).toBe(false);
    }
  });
});
