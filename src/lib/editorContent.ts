import { renderMarkdown } from "./markdown";
import { htmlToMarkdown } from "./htmlToMarkdown";

// Pont entre la source de vérité de l'app (une chaîne Markdown, stockée dans
// la tâche) et le document de l'éditeur Tiptap, qui ne parle que HTML :
//  - markdownToEditorHtml : Markdown -> HTML assaini (renderMarkdown, LA
//    frontière XSS de l'app) puis réécrit dans le balisage attendu par les
//    extensions Tiptap ;
//  - editorHtmlToMarkdown : HTML de l'éditeur -> Markdown (Turndown), après
//    avoir ramené le balisage propre à Tiptap vers la forme GFM que
//    connaissent les règles de htmlToMarkdown.ts.
// Les deux sens doivent rester symétriques : un aller-retour ne doit pas
// dériver, sinon la description d'une tâche se réécrirait silencieusement à
// chaque ouverture de la modale.

function parseHtml(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

// Remplace un élément par ses propres enfants.
function unwrap(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

// marked rend une case à cocher GFM en `<li><input type="checkbox"> texte</li>`
// alors que les extensions TaskList/TaskItem attendent `data-type` +
// `data-checked`. Sans cette réécriture, une checklist arriverait dans
// l'éditeur en liste à puces avec une case morte.
function toTaskLists(host: HTMLElement): void {
  host.querySelectorAll("li").forEach((li) => {
    const checkbox = li.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]');
    if (!checkbox) return;
    li.setAttribute("data-type", "taskItem");
    li.setAttribute("data-checked", String(checkbox.checked));
    checkbox.remove();
    // marked laisse un espace de séparation après la case : il appartient au
    // marqueur, pas au texte de l'item.
    const first = li.firstChild;
    if (first?.nodeType === Node.TEXT_NODE && first.textContent?.startsWith(" ")) {
      first.textContent = first.textContent.slice(1);
    }
    const list = li.parentElement;
    if (list?.tagName === "UL") list.setAttribute("data-type", "taskList");
  });
}

// Inverse de toTaskLists : TaskItem rend
// `<li data-checked><label><input><span></span></label><div>…</div></li>`, une
// structure que la règle Turndown des cases à cocher (qui attend l'<input>
// comme enfant direct du <li>) ne reconnaît pas.
function fromTaskLists(host: HTMLElement): void {
  host.querySelectorAll('li[data-type="taskItem"]').forEach((li) => {
    const checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    if (li.getAttribute("data-checked") === "true") checkbox.setAttribute("checked", "");

    const label = li.querySelector(":scope > label");
    if (label) label.replaceWith(checkbox);
    else li.prepend(checkbox);
    // Espace de séparation entre le marqueur et le texte : la règle Turndown
    // ne rend que "[x]"/"[ ]".
    checkbox.after(document.createTextNode(" "));

    li.querySelectorAll(":scope > div").forEach(unwrap);
  });
}

// Tiptap enveloppe toujours le contenu d'un item de liste dans un
// paragraphe ; Turndown y verrait une liste "lâche" et insérerait une ligne
// vide entre chaque item à chaque synchronisation.
function tightenListItems(host: HTMLElement): void {
  host.querySelectorAll("li").forEach((li) => {
    const paragraphs = li.querySelectorAll(":scope > p");
    if (paragraphs.length === 1) unwrap(paragraphs[0]!);
  });
}

export function markdownToEditorHtml(markdown: string): string {
  const host = parseHtml(renderMarkdown(markdown));
  toTaskLists(host);
  return host.innerHTML;
}

export function editorHtmlToMarkdown(html: string): string {
  const host = parseHtml(html);
  fromTaskLists(host);
  tightenListItems(host);
  // Le paragraphe vide que Tiptap garde en fin de document (trailingNode, pour
  // pouvoir cliquer sous un tableau) ne doit pas s'accumuler en lignes vides
  // dans la source Markdown.
  return htmlToMarkdown(host.innerHTML).replace(/\s+$/, "");
}
