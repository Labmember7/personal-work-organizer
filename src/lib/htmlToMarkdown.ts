import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Convertit le HTML de l'éditeur riche (Tiptap) vers la syntaxe Markdown que
// sait relire renderMarkdown (marked, gfm: true) : c'est ce qui permet aux
// deux modes de l'éditeur de partager la même source de vérité (la chaîne
// Markdown). Appelé via editorContent.ts, qui normalise au préalable le
// balisage propre à Tiptap.
const turndownService = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
});
turndownService.use(gfm);

// Déclarations CSS d'un attribut style, en minuscules.
function parseStyle(style: string): Map<string, string> {
  const declarations = new Map<string, string>();
  style.split(";").forEach((part) => {
    const separator = part.indexOf(":");
    if (separator === -1) return;
    const property = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    if (property && value) declarations.set(property, value);
  });
  return declarations;
}

// Un span stylé (couleur, police - marque textStyle de Tiptap) est du HTML
// brut dans la source Markdown : sans cette règle, Turndown le réduirait à son
// seul texte et le style serait perdu.
// Un collage depuis un traitement de texte exprime aussi le
// gras/italique/barré/souligné en style inline : ces propriétés-là repartent en
// syntaxe Markdown (**, *, ~~) plutôt qu'en HTML, pour que les boutons de la
// barre d'outils continuent de les reconnaître et de pouvoir les retirer.
const MARK_PROPERTIES = ["font-weight", "font-style", "text-decoration", "text-decoration-line"];

turndownService.addRule("styledSpan", {
  filter: (node) => node.nodeName === "SPAN" && !!node.getAttribute("style"),
  replacement: (content, node) => {
    if (!content.trim()) return content;
    const declarations = parseStyle((node as HTMLElement).getAttribute("style") ?? "");
    const weight = declarations.get("font-weight") ?? "";
    const decoration = `${declarations.get("text-decoration") ?? ""} ${declarations.get("text-decoration-line") ?? ""}`;

    let out = content;
    if (decoration.includes("line-through")) out = `~~${out}~~`;
    if (declarations.get("font-style") === "italic") out = `*${out}*`;
    if (weight === "bold" || weight === "bolder" || Number(weight) >= 600) out = `**${out}**`;
    if (decoration.includes("underline")) out = `<u>${out}</u>`;

    MARK_PROPERTIES.forEach((property) => declarations.delete(property));
    if (declarations.size === 0) return out;
    const style = Array.from(declarations.entries())
      .map(([property, value]) => `${property}:${value}`)
      .join(";");
    return `<span style="${style}">${out}</span>`;
  },
});

// Le Markdown n'a pas de souligné : on le garde en HTML brut (marked le laisse
// passer, DOMPurify l'autorise). Sans cette règle, Ctrl+U ferait disparaître
// silencieusement la mise en forme à la première resynchronisation.
turndownService.addRule("underline", {
  filter: ["u"],
  replacement: (content) => (content.trim() ? `<u>${content}</u>` : content),
});

// <font color="…"> : balise encore produite par certains éditeurs externes,
// donc possible dans un collage. Traduite dans la même forme que la barre
// d'outils (span stylé) pour ne pas perdre la couleur.
turndownService.addRule("fontTag", {
  filter: (node) => node.nodeName === "FONT",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const color = el.getAttribute("color");
    const face = el.getAttribute("face");
    const style = [color ? `color:${color}` : "", face ? `font-family:${face}` : ""].filter(Boolean).join(";");
    if (!style || !content.trim()) return content;
    return `<span style="${style}">${content}</span>`;
  },
});

// Une image redimensionnée (voir editorImage.ts) fige sa largeur dans un
// attribut HTML ; sans cette règle, Turndown la ramènerait à `![alt](src)` et
// la largeur serait perdue.
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
// numérotation `1.  `) alors que marked, qui relit la source, n'a besoin que
// d'un espace unique. Sans cette règle, chaque synchronisation réécrirait la
// liste avec un espacement différent.
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
// fromTaskLists dans editorContent.ts) : sans ce remplacement, la checklist
// aurait un double espace avant le texte de chaque item.
turndownService.addRule("taskListItem", {
  filter: (node) =>
    node.nodeName === "INPUT" && (node as HTMLInputElement).type === "checkbox" && node.parentNode?.nodeName === "LI",
  replacement: (_content, node) => ((node as HTMLInputElement).checked ? "[x]" : "[ ]"),
});

// gfm réduit <del>/<s>/<strike> à un simple tilde, que marked ne relit pas
// comme un barré : sans cette règle, le format serait perdu à la
// resynchronisation suivante.
turndownService.addRule("strikethrough", {
  filter: (node) => ["del", "s", "strike"].includes(node.nodeName.toLowerCase()),
  replacement: (content) => `~~${content}~~`,
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}
