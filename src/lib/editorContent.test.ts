// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "./editorContent";

// Ce module est la charnière entre la source Markdown (ce que l'app stocke) et
// le document Tiptap (ce que l'utilisateur édite) : toute asymétrie entre les
// deux sens réécrit silencieusement la description à chaque ouverture de la
// modale, d'où les tests d'aller-retour.

describe("markdownToEditorHtml", () => {
  it("traduit une checklist GFM en balisage TaskList/TaskItem", () => {
    const html = markdownToEditorHtml("- [ ] a faire\n- [x] fait");
    expect(html).toContain('<ul data-type="taskList">');
    expect(html).toContain('data-type="taskItem" data-checked="false"');
    expect(html).toContain('data-type="taskItem" data-checked="true"');
    expect(html).not.toContain("<input");
    // L'espace qui suit "[ ]" appartient au marqueur, pas au texte de l'item.
    expect(html).toContain(">a faire<");
  });

  it("laisse une liste à puces ordinaire intacte", () => {
    const html = markdownToEditorHtml("- un\n- deux");
    expect(html).toContain("<ul>");
    expect(html).not.toContain("data-type");
  });

  it("assainit le HTML dangereux (frontière XSS conservée)", () => {
    expect(markdownToEditorHtml("<script>alert(1)</script>")).not.toContain("<script");
  });
});

describe("editorHtmlToMarkdown", () => {
  it("rend une checklist Tiptap en cases à cocher GFM", () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>a faire</p></div></li>' +
      '<li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>fait</p></div></li>' +
      "</ul>";
    expect(editorHtmlToMarkdown(html)).toBe("- [ ] a faire\n- [x] fait");
  });

  it("garde les listes serrées malgré les paragraphes que Tiptap ajoute", () => {
    const html = "<ul><li><p>un</p></li><li><p>deux</p></li></ul>";
    expect(editorHtmlToMarkdown(html)).toBe("- un\n- deux");
  });

  it("conserve la largeur d'une image redimensionnée", () => {
    const html = '<p><img src="app-image://local/a.jpg" width="320"></p>';
    expect(editorHtmlToMarkdown(html)).toBe('<img src="app-image://local/a.jpg" width="320">');
  });

  it("ne laisse pas le paragraphe vide de fin de document polluer la source", () => {
    expect(editorHtmlToMarkdown("<p>texte</p><p></p>")).toBe("texte");
  });
});

describe("aller-retour Markdown -> éditeur -> Markdown", () => {
  const roundTrip = (markdown: string) => editorHtmlToMarkdown(markdownToEditorHtml(markdown));

  it.each([
    ["checklist", "- [ ] a faire\n- [x] fait"],
    ["liste imbriquée", "- un\n  - deux"],
    ["liste numérotée", "1. un\n2. deux"],
    ["titres", "# Titre\n\n## Sous-titre"],
    ["marques", "**gras** et *italique* et ~~barré~~ et `code`"],
    ["souligné (HTML brut)", "<u>souligné</u>"],
    ["span stylé", '<span style="color:#ef4444">rouge</span>'],
    ["citation", "> citation"],
    ["bloc de code", "```\ncode\n```"],
    ["séparateur", "---"],
    ["lien", "[texte](https://example.com)"],
    ["image dimensionnée", '<img src="app-image://local/a.jpg" width="320">'],
    ["tableau", "| Titre | Titre |\n| --- | --- |\n| Cellule | Cellule |"],
  ])("est stable pour %s", (_label, markdown) => {
    expect(roundTrip(markdown)).toBe(markdown);
  });
});
