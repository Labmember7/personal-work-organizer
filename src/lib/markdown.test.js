// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown";

// renderMarkdown est LA frontière XSS de l'app : la description d'une tâche
// peut provenir d'un import JSON externe. Une régression DOMPurify/marked
// doit être détectée ici.
describe("renderMarkdown (assainissement XSS)", () => {
  it("retire les balises <script>", () => {
    const html = renderMarkdown("Bonjour <script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).toContain("Bonjour");
  });

  it("retire les gestionnaires d'événements inline", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("retire les URL javascript:", () => {
    const html = renderMarkdown("[clic](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("retire les iframes et objets embarqués", () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe><object data="x"></object>');
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<object");
  });

  it("neutralise les attributs de style dangereux via balises autorisées seulement", () => {
    const html = renderMarkdown('<a href="https://example.com" target="_blank">lien</a>');
    expect(html).toContain("example.com");
  });

  it("conserve la mise en forme markdown de base", () => {
    const html = renderMarkdown("**gras** et _italique_\n\n- item");
    expect(html).toContain("<strong>gras</strong>");
    expect(html).toContain("<em>italique</em>");
    expect(html).toContain("<li>item</li>");
  });

  it("rend une chaîne vide pour les entrées nulles", () => {
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });

  it("conserve les images app-image: (collées depuis le presse-papiers)", () => {
    const html = renderMarkdown("![](app-image://local/abc123.jpg)");
    expect(html).toContain('src="app-image://local/abc123.jpg"');
  });

  it("retire les schemes d'URI non whitelistés (ex: data:)", () => {
    const html = renderMarkdown('<img src="data:text/html,<script>alert(1)</script>">');
    expect(html).not.toContain("data:text/html");
  });

  it("conserve l'attribut width d'une image redimensionnée", () => {
    const html = renderMarkdown('<img src="app-image://local/abc123.jpg" width="320">');
    expect(html).toContain('width="320"');
    expect(html).toContain('src="app-image://local/abc123.jpg"');
  });
});
