// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "./htmlToMarkdown";
import { renderMarkdown } from "./markdown";

describe("htmlToMarkdown", () => {
  it("convertit gras/italique/barré comme mdFormatting (**, *, ~~)", () => {
    expect(htmlToMarkdown("<p><strong>gras</strong> <em>italique</em> <del>barré</del></p>")).toBe(
      "**gras** *italique* ~~barré~~"
    );
  });

  it("convertit les titres en ATX", () => {
    expect(htmlToMarkdown("<h1>Titre</h1>")).toBe("# Titre");
    expect(htmlToMarkdown("<h2>Titre</h2>")).toBe("## Titre");
    expect(htmlToMarkdown("<h3>Titre</h3>")).toBe("### Titre");
  });

  it("convertit une citation", () => {
    expect(htmlToMarkdown("<blockquote><p>dit</p></blockquote>")).toBe("> dit");
  });

  it("convertit les listes à puces et numérotées", () => {
    expect(htmlToMarkdown("<ul><li>a</li><li>b</li></ul>")).toBe("- a\n- b");
    expect(htmlToMarkdown("<ol><li>a</li><li>b</li></ol>")).toBe("1. a\n2. b");
  });

  it("convertit une checklist avec la case cochée reflétant l'état", () => {
    const html =
      '<ul><li><input type="checkbox"> todo</li><li><input type="checkbox" checked> done</li></ul>';
    expect(htmlToMarkdown(html)).toBe("- [ ] todo\n- [x] done");
  });

  it("convertit un lien et une image", () => {
    expect(htmlToMarkdown('<a href="https://x.test">label</a>')).toBe("[label](https://x.test)");
    expect(htmlToMarkdown('<img src="x.png" alt="alt">')).toBe("![alt](x.png)");
  });

  it("préserve un span stylé (couleur/police) en HTML brut", () => {
    expect(htmlToMarkdown('<span style="color:#ef4444">rouge</span>')).toBe(
      '<span style="color:#ef4444">rouge</span>'
    );
  });

  it("préserve la largeur d'une image redimensionnée", () => {
    expect(htmlToMarkdown('<img src="x.png" width="120" alt="a">')).toBe(
      '<img src="x.png" width="120" alt="a">'
    );
  });

  it("convertit un bloc de code en clôture ```", () => {
    expect(htmlToMarkdown("<pre><code>const x = 1;</code></pre>")).toBe("```\nconst x = 1;\n```");
  });

  it("convertit un tableau GFM", () => {
    const html =
      "<table><thead><tr><th>a</th><th>b</th></tr></thead>" +
      "<tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
    expect(htmlToMarkdown(html)).toBe("| a | b |\n| --- | --- |\n| 1 | 2 |");
  });

  it("convertit une règle horizontale", () => {
    expect(htmlToMarkdown("<hr>")).toBe("---");
  });

  it("fait l'aller-retour avec renderMarkdown pour un document mixte", () => {
    const source =
      "# Titre\n\n**gras** et *italique*\n\n- [ ] a faire\n- [x] fait\n\n> une citation";
    const roundTripped = htmlToMarkdown(renderMarkdown(source));
    expect(roundTripped).toBe(source);
  });
});
