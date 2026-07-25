// Transformations pures pour la barre d'outils de mise en forme de
// MarkdownEditor. Chaque fonction prend le texte complet + la sélection
// courante et renvoie le nouveau texte et la sélection à restaurer, sans
// toucher au DOM : ça les rend testables indépendamment du textarea.

export interface EditResult {
  text: string;
  start: number;
  end: number;
}

const HEADING_RE = /^#{1,6}\s+/;
const QUOTE_RE = /^>\s?/;
const LIST_MARKER_RE = /^(?:[-*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+)/;
const BULLET_RE = /^[-*]\s+(?!\[)/;
const CHECKLIST_RE = /^[-*]\s+\[[ xX]\]\s+/;
const ORDERED_RE = /^\d+\.\s+/;

// Une ligne n'a jamais qu'un seul marqueur de bloc à la fois (titre, citation,
// liste). Chaque `strip` de LineRule ne retirait que son propre marqueur :
// passer d'un titre à une liste (ou l'inverse) laissait donc l'ancien
// marqueur en texte littéral ("- # Title" au lieu de "- Title"), ce qui
// empêchait ensuite marked de reconnaître le titre. On retire ici les trois
// types de marqueur avant d'appliquer le nouveau, quel que soit celui présent.
function stripBlockMarkers(line: string): string {
  return line.replace(HEADING_RE, "").replace(QUOTE_RE, "").replace(LIST_MARKER_RE, "");
}

// Entoure la sélection d'un marqueur symétrique (**, *, ~~, `). Si le
// marqueur est déjà présent (dans la sélection, ou juste autour d'elle), le
// retire à la place : appeler deux fois de suite bascule gras on/off.
export function toggleWrap(value: string, start: number, end: number, marker: string, placeholder: string): EditResult {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length >= marker.length * 2) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return { text: before + inner + after, start, end: start + inner.length };
  }
  if (before.endsWith(marker) && after.startsWith(marker)) {
    const newBefore = before.slice(0, before.length - marker.length);
    const newAfter = after.slice(marker.length);
    return { text: newBefore + selected + newAfter, start: start - marker.length, end: end - marker.length };
  }
  const text = selected || placeholder;
  return {
    text: before + marker + text + marker + after,
    start: before.length + marker.length,
    end: before.length + marker.length + text.length,
  };
}

interface LineRule {
  matches: (line: string) => boolean;
  strip: (line: string) => string;
  format: (strippedLine: string, index: number) => string;
}

// Applique (ou retire, en bascule) un préfixe à chaque ligne non vide
// couverte par la sélection : titres, citation, listes. `strip` retire tout
// marqueur concurrent (ex: une puce existante avant de passer en liste
// numérotée) avant que `format` n'applique le nouveau préfixe.
function transformLines(value: string, start: number, end: number, rule: LineRule): EditResult {
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = value.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const before = value.slice(0, lineStart);
  const after = value.slice(lineEnd);
  const lines = value.slice(lineStart, lineEnd).split("\n");
  const contentLines = lines.filter((l) => l.trim());
  const allMatch = contentLines.length > 0 && contentLines.every(rule.matches);

  let contentIndex = 0;
  const newLines = lines.map((line) => {
    if (!line.trim()) return line;
    const stripped = rule.strip(line);
    const result = allMatch ? stripped : rule.format(stripped, contentIndex);
    contentIndex += 1;
    return result;
  });
  const block = newLines.join("\n");
  return { text: before + block + after, start: before.length, end: before.length + block.length };
}

export function toggleHeading(value: string, start: number, end: number, level: 1 | 2 | 3): EditResult {
  const marker = "#".repeat(level) + " ";
  return transformLines(value, start, end, {
    matches: (l) => new RegExp(`^#{${level}}\\s+`).test(l),
    strip: stripBlockMarkers,
    format: (l) => marker + l,
  });
}

// Retire tout marqueur de titre pour revenir à du texte simple. Action à
// sens unique (pas de bascule : "paragraphe" n'a pas d'état "actif" à
// retirer), contrairement à toggleHeading.
export function setParagraph(value: string, start: number, end: number): EditResult {
  return transformLines(value, start, end, {
    matches: () => false,
    strip: stripBlockMarkers,
    format: (l) => l,
  });
}

export function toggleQuote(value: string, start: number, end: number): EditResult {
  return transformLines(value, start, end, {
    matches: (l) => QUOTE_RE.test(l),
    strip: stripBlockMarkers,
    format: (l) => "> " + l,
  });
}

export function toggleBulletList(value: string, start: number, end: number): EditResult {
  return transformLines(value, start, end, {
    matches: (l) => BULLET_RE.test(l),
    strip: stripBlockMarkers,
    format: (l) => "- " + l,
  });
}

export function toggleOrderedList(value: string, start: number, end: number): EditResult {
  return transformLines(value, start, end, {
    matches: (l) => ORDERED_RE.test(l),
    strip: stripBlockMarkers,
    format: (l, i) => `${i + 1}. ${l}`,
  });
}

export function toggleChecklist(value: string, start: number, end: number): EditResult {
  return transformLines(value, start, end, {
    matches: (l) => CHECKLIST_RE.test(l),
    strip: stripBlockMarkers,
    format: (l) => "- [ ] " + l,
  });
}

// Enveloppe la sélection dans un <span style="..."> (couleur, police). Si la
// sélection correspond exactement au contenu d'un span existant portant déjà
// la même propriété (une nouvelle couleur après une première, par exemple),
// son style est mis à jour à la place : sans ça, changer d'avis sur une
// couleur empilerait les spans imbriqués au lieu de la remplacer.
export function wrapStyle(value: string, start: number, end: number, style: string, placeholder: string): EditResult {
  const selected = value.slice(start, end) || placeholder;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const property = style.split(":")[0];

  const openMatch = before.match(/<span style="([^"]*)">$/);
  const existingProperty = openMatch?.[1]?.split(":")[0];
  if (openMatch && existingProperty === property && after.startsWith("</span>")) {
    const newBefore = before.slice(0, before.length - openMatch[0].length);
    const newAfter = after.slice("</span>".length);
    const openTag = `<span style="${style}">`;
    return {
      text: newBefore + openTag + selected + "</span>" + newAfter,
      start: newBefore.length + openTag.length,
      end: newBefore.length + openTag.length + selected.length,
    };
  }

  const openTag = `<span style="${style}">`;
  return {
    text: before + openTag + selected + "</span>" + after,
    start: before.length + openTag.length,
    end: before.length + openTag.length + selected.length,
  };
}

export function insertLink(value: string, start: number, end: number, labelPlaceholder: string, urlPlaceholder: string): EditResult {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const label = selected || labelPlaceholder;
  const text = `[${label}](${urlPlaceholder})`;
  if (selected) {
    const urlStart = before.length + label.length + 3;
    return { text: before + text + after, start: urlStart, end: urlStart + urlPlaceholder.length };
  }
  return { text: before + text + after, start: before.length + 1, end: before.length + 1 + label.length };
}

export function insertImage(value: string, start: number, end: number, altPlaceholder: string, urlPlaceholder: string): EditResult {
  const selected = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);
  const alt = selected || altPlaceholder;
  const text = `![${alt}](${urlPlaceholder})`;
  if (selected) {
    const urlStart = before.length + alt.length + 4;
    return { text: before + text + after, start: urlStart, end: urlStart + urlPlaceholder.length };
  }
  return { text: before + text + after, start: before.length + 2, end: before.length + 2 + alt.length };
}

// Insère un bloc (règle horizontale, code, tableau) en s'assurant qu'il est
// séparé du texte environnant par une ligne vide, sans dupliquer les sauts
// de ligne déjà présents.
function insertPaddedBlock(value: string, start: number, end: number, block: string): EditResult {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const lead = !before ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const trail = !after ? "" : after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  return {
    text: before + lead + block + trail + after,
    start: before.length + lead.length,
    end: before.length + lead.length + block.length,
  };
}

export function insertDivider(value: string, start: number, end: number): EditResult {
  return insertPaddedBlock(value, start, end, "---");
}

export function wrapCodeBlock(value: string, start: number, end: number, placeholder: string): EditResult {
  const selected = value.slice(start, end) || placeholder;
  const block = "```\n" + selected + "\n```";
  const result = insertPaddedBlock(value, start, end, block);
  const innerStart = result.start + 4;
  return { text: result.text, start: innerStart, end: innerStart + selected.length };
}

export function insertTable(value: string, start: number, end: number, headerPlaceholder: string, cellPlaceholder: string): EditResult {
  const block =
    `| ${headerPlaceholder} | ${headerPlaceholder} |\n` +
    `| --- | --- |\n` +
    `| ${cellPlaceholder} | ${cellPlaceholder} |`;
  const result = insertPaddedBlock(value, start, end, block);
  const firstHeaderStart = result.start + 2;
  return { text: result.text, start: firstHeaderStart, end: firstHeaderStart + headerPlaceholder.length };
}
