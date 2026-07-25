import { describe, it, expect } from "vitest";
import { collectImageRefs } from "./images";

describe("collectImageRefs", () => {
  it("retrouve une image en syntaxe Markdown", () => {
    expect(collectImageRefs(["![](app-image://local/abc-123.jpg)"])).toEqual(["abc-123.jpg"]);
  });

  it("retrouve une image redimensionnée (balise <img> avec width)", () => {
    const md = '<img src="app-image://local/def-456.jpg" width="320" alt="x">';
    expect(collectImageRefs([md])).toEqual(["def-456.jpg"]);
  });

  it("dédoublonne les références et couvre plusieurs textes", () => {
    const refs = collectImageRefs([
      "![](app-image://local/a.jpg) et ![](app-image://local/a.jpg)",
      '<img src="app-image://local/b.jpg" width="10">',
    ]);
    expect(refs.sort()).toEqual(["a.jpg", "b.jpg"]);
  });

  it("ignore les descriptions vides ou absentes", () => {
    expect(collectImageRefs(["", null, undefined, "pas d'image"])).toEqual([]);
  });

  it("ignore les images externes et les autres schemes", () => {
    const md = "![](https://example.com/x.jpg) ![](file:///tmp/y.jpg)";
    expect(collectImageRefs([md])).toEqual([]);
  });

  it("ne capture pas de chemin traversant", () => {
    expect(collectImageRefs(["![](app-image://local/../../store.json.jpg)"])).toEqual([]);
  });
});
