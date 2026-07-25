// Transformations DOM pour la barre d'outils de MarkdownEditor en mode
// "Formaté" (WYSIWYG) : équivalent, sur la sélection du navigateur dans le
// contentEditable, des transformations texte de mdFormatting.ts sur la
// sélection du textarea. Le résultat est reconverti en Markdown par
// htmlToMarkdown juste après (voir MarkdownEditor.jsx), donc chaque fonction
// ne fait que manipuler le DOM : pas de valeur de retour à consommer.

function getRangeWithin(container: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  return range;
}

function selectNode(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function wrapSelectionInSpan(container: HTMLElement, style: string, placeholder: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const span = document.createElement("span");
  span.setAttribute("style", style);
  if (range.collapsed) {
    span.textContent = placeholder;
    range.insertNode(span);
  } else {
    span.appendChild(range.extractContents());
    range.insertNode(span);
  }
  selectNode(span);
}

export function wrapSelectionInTag(container: HTMLElement, tagName: string, placeholder: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const node = document.createElement(tagName);
  if (range.collapsed) {
    node.textContent = placeholder;
    range.insertNode(node);
  } else {
    node.appendChild(range.extractContents());
    range.insertNode(node);
  }
  selectNode(node);
}

// Construit une checklist à partir des lignes sélectionnées (une ligne par
// item) ; sans sélection, un item unique avec le texte indicatif.
export function insertChecklist(container: HTMLElement, placeholder: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const text = range.toString();
  const lines = text ? text.split("\n").map((l) => l.trim()).filter(Boolean) : [placeholder];
  const ul = document.createElement("ul");
  lines.forEach((line) => {
    const li = document.createElement("li");
    const input = document.createElement("input");
    input.type = "checkbox";
    li.appendChild(input);
    li.appendChild(document.createTextNode(" " + line));
    ul.appendChild(li);
  });
  range.deleteContents();
  range.insertNode(ul);
}

export function insertCodeBlock(container: HTMLElement, placeholder: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const text = range.toString() || placeholder;
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = text;
  pre.appendChild(code);
  range.deleteContents();
  range.insertNode(pre);
  selectNode(code);
}

export function insertTable(container: HTMLElement, headerText: string, cellText: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (let i = 0; i < 2; i += 1) {
    const th = document.createElement("th");
    th.textContent = headerText;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  const bodyRow = document.createElement("tr");
  for (let i = 0; i < 2; i += 1) {
    const td = document.createElement("td");
    td.textContent = cellText;
    bodyRow.appendChild(td);
  }
  tbody.appendChild(bodyRow);
  table.appendChild(thead);
  table.appendChild(tbody);
  range.deleteContents();
  range.insertNode(table);
}

export function insertDivider(container: HTMLElement): void {
  const range = getRangeWithin(container);
  if (!range) return;
  range.deleteContents();
  range.insertNode(document.createElement("hr"));
}

export function insertLink(container: HTMLElement, url: string, labelPlaceholder: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const a = document.createElement("a");
  a.setAttribute("href", url);
  if (range.collapsed) {
    a.textContent = labelPlaceholder;
    range.insertNode(a);
  } else {
    a.appendChild(range.extractContents());
    range.insertNode(a);
  }
  selectNode(a);
}

export function insertImage(container: HTMLElement, url: string, alt: string): void {
  const range = getRangeWithin(container);
  if (!range) return;
  const img = document.createElement("img");
  img.setAttribute("src", url);
  if (alt) img.setAttribute("alt", alt);
  range.deleteContents();
  range.insertNode(img);
}

// Bascule le bloc courant (paragraphe contenant le curseur) vers `tagName`
// (H1-H3, BLOCKQUOTE) ; s'il l'est déjà, repasse en paragraphe simple, sauf
// si `force` (utilisé par le bouton "Paragraphe", qui n'a pas d'état "actif"
// à retirer - voir setParagraph dans mdFormatting.ts).
export function toggleBlockFormat(container: HTMLElement, tagName: string, force = false): void {
  const range = getRangeWithin(container);
  const anchor = range?.startContainer;
  const el = anchor instanceof Element ? anchor : anchor?.parentElement ?? null;

  // execCommand("formatBlock") n'exclut pas la liste courante : appliqué dans
  // un <li>, il imbrique le titre dedans (<li><h1>...) au lieu d'en sortir.
  // Une fois reconverti en Markdown, le préfixe "- " de l'item se retrouve
  // devant le "# " du titre (texte littéral, plus reconnu comme titre par
  // marked) - le même bug que côté texte, où chaque bascule doit repartir
  // d'un seul marqueur de bloc à la fois (voir stripBlockMarkers,
  // mdFormatting.ts). On sort donc d'abord de la liste le cas échéant.
  const listItem = el?.closest("li");
  if (listItem && container.contains(listItem)) {
    document.execCommand(listItem.parentElement?.tagName === "OL" ? "insertOrderedList" : "insertUnorderedList");
  }

  const current = el?.closest("h1,h2,h3,blockquote,p") ?? null;
  const isActive = !!current && container.contains(current) && current.tagName === tagName;
  document.execCommand("formatBlock", false, !force && isActive ? "P" : tagName);
}
