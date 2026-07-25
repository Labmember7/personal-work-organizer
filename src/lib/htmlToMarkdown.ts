import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Convertit le HTML de l'éditeur "Formaté" (WYSIWYG) vers la même syntaxe
// Markdown que produit la barre d'outils en mode Texte (voir mdFormatting.ts)
// et que sait relire renderMarkdown (marked, gfm: true) : c'est ce qui permet
// aux deux modes de partager la même source de vérité (la chaîne Markdown).
const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});
turndownService.use(gfm);

// Un span stylé (couleur, police - voir wrapStyle dans mdFormatting.ts) est de
// le HTML brut dans la source Markdown : sans cette règle, Turndown le
// réduirait à son seul texte et le style serait perdu.
turndownService.addRule("styledSpan", {
  filter: (node) => node.nodeName === "SPAN" && !!node.getAttribute("style"),
  replacement: (content, node) => `<span style="${(node as HTMLElement).getAttribute("style")}">${content}</span>`,
});

// Une image redimensionnée (voir setImageWidth dans MarkdownEditor.jsx) fige
// sa largeur dans un attribut HTML ; sans cette règle, Turndown la ramènerait
// à `![alt](src)` et la largeur serait perdue.
turndownService.addRule("sizedImage", {
  filter: (node) => node.nodeName === "IMG" && !!node.getAttribute("width"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("src") || "";
    const width = el.getAttribute("width") || "";
    const alt = el.getAttribute("alt") || "";
    return `<img src="${src}" width="${width}"${alt ? ` alt="${alt}"` : ""}>`;
  },
});

// Turndown aligne par défaut le marqueur de liste sur 3/4 caractères (façon
// numérotation `1.  `) ; mdFormatting.ts (mode Texte) n'utilise toujours
// qu'un espace unique. Sans cette règle, un aller-retour Texte -> Formaté ->
// Texte réécrirait la liste avec un espacement différent à chaque passage.
turndownService.addRule("listItem", {
  filter: "li",
  replacement: (content, node, options) => {
    const trimmed = content.replace(/^\n+/, "").replace(/\n+$/, "");
    const isParagraph = /\n$/.test(content);
    const parent = node.parentNode as HTMLElement | null;
    let prefix = `${options.bulletListMarker} `;
    if (parent?.nodeName === "OL") {
      const start = parent.getAttribute("start");
      const index = Array.prototype.indexOf.call(parent.children, node);
      prefix = `${start ? Number(start) + index : index + 1}. `;
    }
    const indented = trimmed.replace(/\n/gm, "\n" + " ".repeat(prefix.length));
    return prefix + indented + (isParagraph ? "\n" : "") + (node.nextSibling ? "\n" : "");
  },
});

// La case à cocher gfm restitue "[ ] "/"[x] " (espace de fin inclus), mais le
// texte qui suit porte déjà son propre espace de séparation (voir
// insertChecklist dans richTextEditing.ts) : sans ce remplacement, la
// checklist aurait un double espace avant le texte de chaque item.
turndownService.addRule("taskListItem", {
  filter: (node) =>
    node.nodeName === "INPUT" && (node as HTMLInputElement).type === "checkbox" && node.parentNode?.nodeName === "LI",
  replacement: (_content, node) => ((node as HTMLInputElement).checked ? "[x]" : "[ ]"),
});

// gfm réduit <del>/<s>/<strike> à un simple tilde ; mdFormatting.ts (bouton
// "barré", mode Texte) utilise toujours le double tilde ~~ - il faut la même
// syntaxe des deux côtés pour que l'historique d'annulation reste cohérent
// quel que soit le mode dans lequel l'action a été faite.
turndownService.addRule("strikethrough", {
  filter: (node) => ["del", "s", "strike"].includes(node.nodeName.toLowerCase()),
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}
