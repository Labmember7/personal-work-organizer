import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HelpCircle, Pilcrow, Eye,
  Bold, Italic, Strikethrough, Heading1, Heading2, Heading3, Quote,
  List, ListOrdered, ListChecks, Link2, Image as ImageIcon, Minus, Table,
  Code, SquareCode, Palette, Type, Undo2, Redo2, Check,
} from "lucide-react";
import { useLang } from "../i18n.jsx";
import { renderMarkdown } from "../utils";
import {
  toggleWrap, toggleHeading, setParagraph, toggleQuote, toggleBulletList, toggleOrderedList,
  toggleChecklist, wrapStyle, insertLink, insertImage, insertDivider,
  wrapCodeBlock, insertTable,
} from "../lib/mdFormatting";
import {
  wrapSelectionInSpan, wrapSelectionInTag, toggleBlockFormat,
  insertChecklist as richInsertChecklist, insertCodeBlock as richInsertCodeBlock,
  insertTable as richInsertTable, insertDivider as richInsertDivider,
  insertLink as richInsertLink, insertImage as richInsertImage,
} from "../lib/richTextEditing";
import { htmlToMarkdown } from "../lib/htmlToMarkdown";

// Historique borné (pas de clone profond : uniquement des chaînes, déjà
// légères) pour undo/redo local à l'éditeur. Une rafale de frappe rapide
// (< TYPING_COALESCE_MS entre deux caractères) fusionne en une seule
// entrée, comme un traitement de texte classique ; les actions de la barre
// d'outils forcent toujours un nouveau point d'annulation.
const HISTORY_LIMIT = 200;
const TYPING_COALESCE_MS = 600;

// Insère du texte à la position du curseur (ou en fin si la ref n'est pas
// encore montée) et renvoie la nouvelle valeur + la position du curseur.
function insertAtCursor(el, value, insertion) {
  const start = el?.selectionStart ?? value.length;
  const end = el?.selectionEnd ?? value.length;
  return { text: value.slice(0, start) + insertion + value.slice(end), caret: start + insertion.length };
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Fixe (ou met à jour) la largeur d'une image du Markdown source, identifiée
// par son URL exacte (nom de fichier uuid généré au collage : pas de
// collision possible). Convertit `![alt](src)` en `<img>` HTML au premier
// redimensionnement, puis ne fait plus que réécrire l'attribut width.
function setImageWidth(markdown, src, width) {
  const escaped = escapeRegExp(src);
  const htmlImgRegex = new RegExp(`<img\\b[^>]*\\bsrc=["']${escaped}["'][^>]*>`, "i");
  const existingTag = markdown.match(htmlImgRegex)?.[0];
  if (existingTag) {
    const updatedTag = /\bwidth=["'][^"']*["']/i.test(existingTag)
      ? existingTag.replace(/\bwidth=["'][^"']*["']/i, `width="${width}"`)
      : existingTag.replace(/\/?>$/, ` width="${width}">`);
    return markdown.replace(existingTag, updatedTag);
  }
  const mdImgRegex = new RegExp(`!\\[([^\\]]*)\\]\\(${escaped}\\)`);
  const mdMatch = markdown.match(mdImgRegex);
  if (!mdMatch) return markdown;
  const alt = mdMatch[1];
  return markdown.replace(mdMatch[0], `<img src="${src}" width="${width}"${alt ? ` alt="${alt}"` : ""}>`);
}

// Place le curseur dans `el` (fin du contenu) si la sélection courante du
// navigateur n'y est pas déjà : nécessaire avant d'exécuter une commande de
// mise en forme (execCommand, Range) déclenchée depuis un bouton de la barre
// d'outils, qui n'a pas fait perdre le focus au contentEditable lui-même.
function ensureSelectionInside(el) {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0 && el.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

// Insère un nœud à la position du curseur dans `container` (ou en fin si la
// sélection courante n'y est pas), et laisse le curseur juste après.
function insertNodeAtSelection(container, node) {
  const sel = window.getSelection();
  const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  if (!range || !container.contains(range.commonAncestorContainer)) {
    container.appendChild(node);
    return;
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function isImageNode(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  return node.tagName === "IMG" || node.classList?.contains("trk-img-resizable");
}

// Un curseur collé au bord d'une image (élément "atomique" pour le DOM) ne
// laisse pas toujours Chromium/Electron trouver un point d'insertion valide
// pour scinder le paragraphe : Entrée natif (execCommand insertParagraph) peut
// alors ne rien faire du tout. On détecte précisément ce cas pour scinder le
// bloc nous-mêmes (splitBlockAtCaret) ; partout ailleurs, Entrée reste géré
// nativement par le contentEditable.
function isCaretNextToImage(range) {
  if (!range.collapsed) return false;
  const { startContainer, startOffset } = range;
  if (startContainer.nodeType === Node.TEXT_NODE) {
    if (startOffset === 0) return isImageNode(startContainer.previousSibling);
    if (startOffset === startContainer.textContent.length) return isImageNode(startContainer.nextSibling);
    return false;
  }
  if (startContainer.nodeType === Node.ELEMENT_NODE) {
    return isImageNode(startContainer.childNodes[startOffset - 1]) || isImageNode(startContainer.childNodes[startOffset]);
  }
  return false;
}

const FORMATTED_BLOCK_TAGS = new Set(["P", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "TD", "TH"]);

function closestFormattedBlock(container, node) {
  let el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  while (el && el !== container) {
    if (FORMATTED_BLOCK_TAGS.has(el.tagName)) return el;
    el = el.parentElement;
  }
  return null;
}

// Scinde en deux le bloc contenant le curseur (même résultat que le Entrée
// natif dans un paragraphe), en s'appuyant uniquement sur Range/DOM : voir
// isCaretNextToImage pour le cas précis où c'est nécessaire.
function splitBlockAtCaret(container, range) {
  const block = closestFormattedBlock(container, range.startContainer);
  if (!block || !block.parentNode) return null;
  const tailRange = document.createRange();
  tailRange.setStart(range.startContainer, range.startOffset);
  tailRange.setEnd(block, block.childNodes.length);
  const tail = tailRange.extractContents();
  if (!block.hasChildNodes()) block.appendChild(document.createElement("br"));
  const newBlock = document.createElement(block.tagName);
  newBlock.appendChild(tail);
  if (!newBlock.hasChildNodes()) newBlock.appendChild(document.createElement("br"));
  block.parentNode.insertBefore(newBlock, block.nextSibling);
  const caretRange = document.createRange();
  caretRange.setStart(newBlock, 0);
  caretRange.collapse(true);
  return caretRange;
}

const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#0ea5e9", "#6366f1", "#a855f7", "#64748b",
];

const FONT_OPTIONS = [
  { id: "sans", style: "font-family:'Inter',sans-serif", labelKey: "md_font_sans" },
  { id: "serif", style: "font-family:Georgia,'Times New Roman',serif", labelKey: "md_font_serif" },
  { id: "mono", style: "font-family:'JetBrains Mono','Space Mono',monospace", labelKey: "md_font_mono" },
  { id: "hand", style: "font-family:'Segoe Print','Bradley Hand',cursive", labelKey: "md_font_hand" },
];

// Éditeur Markdown à bascule Texte/Formaté (façon Jira), utilisé pour la
// description d'une tâche. "Texte" édite la source Markdown brute dans un
// textarea (barre d'outils = transformations de chaînes, mdFormatting.ts).
// "Formaté" édite directement le rendu (contentEditable, WYSIWYG) : la barre
// d'outils y agit sur le DOM/la sélection navigateur (execCommand ou Range,
// richTextEditing.ts), et chaque modification est reconvertie en Markdown via
// htmlToMarkdown pour rester la même source de vérité (`value`) dans les deux
// modes. Le contentEditable n'est jamais peuplé par React (pas de children/
// dangerouslySetInnerHTML) : son innerHTML n'est réécrit qu'après un
// changement externe (bascule de mode, undo/redo, redimensionnement d'image),
// jamais après une frappe ou une action de la barre d'outils qui l'a déjà mis
// à jour lui-même - sinon le curseur sauterait à chaque caractère.
// Le collage d'une image (capture d'écran, copie depuis un explorateur…) est
// intercepté dans les deux modes : l'image est envoyée à main.js pour
// redimensionnement et compression, puis référencée dans le Markdown via le
// protocole app-image:. Une fois affichée en mode Formaté, l'image porte une
// poignée de redimensionnement (coin bas-droit) : la glisser met à jour le
// Markdown source (largeur figée en HTML, hauteur laissée automatique).
export function MarkdownEditor({ id, value, onChange, mode, onModeChange, placeholder, onToast }) {
  const { t } = useLang();
  const textareaRef = useRef(null);
  const formattedRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const html = useMemo(() => renderMarkdown(value), [value]);

  // Vrai juste après que le contentEditable a lui-même déclenché une mise à
  // jour de `value` (frappe, bouton de la barre d'outils, coche de
  // checklist) : l'effet de peinture ci-dessous consomme ce drapeau pour ne
  // PAS réécrire innerHTML dans ce cas (son DOM est déjà à jour), et ne le
  // fait que pour un changement externe (bascule de mode, undo/redo,
  // redimensionnement d'image, collage).
  const selfEditRef = useRef(false);

  // Piles d'annulation/rétablissement (références de chaînes, pas de clone
  // profond) : voir la note en tête de fichier. canUndo/canRedo passent par
  // un état pour piloter les boutons sans exposer les piles elles-mêmes au
  // rendu.
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const lastRecordRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const recordHistory = useCallback(() => {
    pastRef.current.push(valueRef.current);
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
  }, []);

  // mode "record" (défaut) : action de la barre d'outils, toujours un
  // nouveau point. "coalesce" : frappe clavier, fusionnée si elle suit de
  // près la précédente. "silent" : mise à jour interne qui complète une
  // action déjà enregistrée (ex. remplacement du placeholder d'upload
  // d'image) sans créer d'entrée supplémentaire.
  const emitChange = useCallback((text, mode = "record") => {
    if (mode === "record") {
      recordHistory();
      lastRecordRef.current = Date.now();
    } else if (mode === "coalesce") {
      const now = Date.now();
      if (now - lastRecordRef.current > TYPING_COALESCE_MS) recordHistory();
      lastRecordRef.current = now;
    }
    onChangeRef.current({ target: { value: text } });
  }, [recordHistory]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (prev === undefined) return;
    futureRef.current.push(valueRef.current);
    if (futureRef.current.length > HISTORY_LIMIT) futureRef.current.shift();
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
    lastRecordRef.current = 0;
    onChangeRef.current({ target: { value: prev } });
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (next === undefined) return;
    pastRef.current.push(valueRef.current);
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    setCanRedo(futureRef.current.length > 0);
    setCanUndo(true);
    lastRecordRef.current = 0;
    onChangeRef.current({ target: { value: next } });
  }, []);

  // Ctrl+Z / Ctrl+Y (ou Ctrl+Shift+Z) sur tout l'éditeur : le undo natif du
  // textarea/contentEditable ne suit pas nos mises à jour programmatiques
  // (barre d'outils), donc on le remplace entièrement ici. stopPropagation
  // empêche le raccourci global de l'app (historique tâches/projets) de se
  // déclencher en plus pendant l'édition de la description.
  const handleEditorKeyDown = useCallback((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const isUndo = key === "z" && !e.shiftKey;
    const isRedo = key === "y" || (key === "z" && e.shiftKey);
    if (!isUndo && !isRedo) return;
    e.preventDefault();
    e.stopPropagation();
    if (isUndo) undo();
    else redo();
  }, [undo, redo]);

  const [openMenu, setOpenMenu] = useState(null); // null | "heading" | "color" | "font"
  const [customColor, setCustomColor] = useState("#000000");
  const toolbarRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return undefined;
    const onDown = (e) => {
      if (!toolbarRef.current?.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpenMenu(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  // Applique une transformation pure (src/lib/mdFormatting) au texte courant
  // à partir de la sélection du textarea, puis restaure le focus et la
  // sélection sur la partie modifiée pour enchaîner les mises en forme.
  // Mode Texte uniquement : voir applyFormattedEdit pour l'équivalent DOM du
  // mode Formaté.
  const applyEdit = useCallback((compute) => {
    const el = textareaRef.current;
    const val = valueRef.current;
    const start = el?.selectionStart ?? val.length;
    const end = el?.selectionEnd ?? val.length;
    const result = compute(val, start, end);
    emitChange(result.text);
    setOpenMenu(null);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.start, result.end);
    });
  }, [emitChange]);

  // Reconvertit l'innerHTML courant du contentEditable en Markdown et met à
  // jour `value`. `selfEditRef` prévient l'effet de peinture qu'il n'a pas
  // besoin de réécrire le DOM : il est déjà à jour.
  const syncFormattedToMarkdown = useCallback((recordMode = "record") => {
    const el = formattedRef.current;
    if (!el) return;
    selfEditRef.current = true;
    emitChange(htmlToMarkdown(el.innerHTML), recordMode);
  }, [emitChange]);

  // Équivalent de applyEdit pour le mode Formaté : `run` manipule le DOM du
  // contentEditable (execCommand ou Range, richTextEditing.ts) à partir de la
  // sélection navigateur courante, puis le résultat est reconverti en
  // Markdown.
  const applyFormattedEdit = useCallback((run) => {
    const el = formattedRef.current;
    if (!el) return;
    el.focus();
    ensureSelectionInside(el);
    run(el);
    syncFormattedToMarkdown("record");
    setOpenMenu(null);
  }, [syncFormattedToMarkdown]);

  const formatGroups = useMemo(() => [
    [
      {
        id: "bold", icon: Bold, title: t("md_bold"),
        run: (v, s, e) => toggleWrap(v, s, e, "**", t("md_placeholder_bold")),
        runRich: () => document.execCommand("bold"),
      },
      {
        id: "italic", icon: Italic, title: t("md_italic"),
        run: (v, s, e) => toggleWrap(v, s, e, "*", t("md_placeholder_italic")),
        runRich: () => document.execCommand("italic"),
      },
      {
        id: "strike", icon: Strikethrough, title: t("md_strike"),
        run: (v, s, e) => toggleWrap(v, s, e, "~~", t("md_placeholder_strike")),
        runRich: () => document.execCommand("strikeThrough"),
      },
    ],
    [
      {
        id: "quote", icon: Quote, title: t("md_quote"),
        run: (v, s, e) => toggleQuote(v, s, e),
        runRich: (el) => toggleBlockFormat(el, "BLOCKQUOTE"),
      },
      {
        id: "bullet", icon: List, title: t("md_bullet_list"),
        run: (v, s, e) => toggleBulletList(v, s, e),
        runRich: () => document.execCommand("insertUnorderedList"),
      },
      {
        id: "ordered", icon: ListOrdered, title: t("md_ordered_list"),
        run: (v, s, e) => toggleOrderedList(v, s, e),
        runRich: () => document.execCommand("insertOrderedList"),
      },
      {
        id: "checklist", icon: ListChecks, title: t("md_checklist"),
        run: (v, s, e) => toggleChecklist(v, s, e),
        runRich: (el) => richInsertChecklist(el, t("md_placeholder_checklist_item")),
      },
    ],
    [
      {
        id: "link", icon: Link2, title: t("md_link"),
        run: (v, s, e) => insertLink(v, s, e, t("md_placeholder_link_label"), t("md_placeholder_url")),
        runRich: (el) => {
          const url = window.prompt(t("md_prompt_url"), "https://");
          if (url) richInsertLink(el, url, t("md_placeholder_link_label"));
        },
      },
      {
        id: "image", icon: ImageIcon, title: t("md_image_insert"),
        run: (v, s, e) => insertImage(v, s, e, t("md_placeholder_image_alt"), t("md_placeholder_url")),
        runRich: (el) => {
          const url = window.prompt(t("md_prompt_url"), "https://");
          if (url) richInsertImage(el, url, t("md_placeholder_image_alt"));
        },
      },
      {
        id: "code", icon: Code, title: t("md_code_inline"),
        run: (v, s, e) => toggleWrap(v, s, e, "`", t("md_placeholder_code_inline")),
        runRich: (el) => wrapSelectionInTag(el, "code", t("md_placeholder_code_inline")),
      },
      {
        id: "codeblock", icon: SquareCode, title: t("md_code_block"),
        run: (v, s, e) => wrapCodeBlock(v, s, e, t("md_placeholder_code_block")),
        runRich: (el) => richInsertCodeBlock(el, t("md_placeholder_code_block")),
      },
    ],
    [
      {
        id: "table", icon: Table, title: t("md_table"),
        run: (v, s, e) => insertTable(v, s, e, t("md_table_header"), t("md_table_cell")),
        runRich: (el) => richInsertTable(el, t("md_table_header"), t("md_table_cell")),
      },
      {
        id: "hr", icon: Minus, title: t("md_divider"),
        run: (v, s, e) => insertDivider(v, s, e),
        runRich: (el) => richInsertDivider(el),
      },
    ],
  ], [t]);

  const headingOptions = useMemo(() => [
    {
      level: 0, icon: Pilcrow, title: t("md_paragraph"),
      run: (v, s, e) => setParagraph(v, s, e),
      runRich: (el) => toggleBlockFormat(el, "P", true),
    },
    {
      level: 1, icon: Heading1, title: t("md_heading_1"),
      run: (v, s, e) => toggleHeading(v, s, e, 1),
      runRich: (el) => toggleBlockFormat(el, "H1"),
    },
    {
      level: 2, icon: Heading2, title: t("md_heading_2"),
      run: (v, s, e) => toggleHeading(v, s, e, 2),
      runRich: (el) => toggleBlockFormat(el, "H2"),
    },
    {
      level: 3, icon: Heading3, title: t("md_heading_3"),
      run: (v, s, e) => toggleHeading(v, s, e, 3),
      runRich: (el) => toggleBlockFormat(el, "H3"),
    },
  ], [t]);

  const runFormat = useCallback((item) => {
    if (mode === "formatted") applyFormattedEdit(item.runRich);
    else applyEdit(item.run);
  }, [mode, applyFormattedEdit, applyEdit]);

  // Nettoyage du glisser de redimensionnement en cours, si le composant est
  // démonté avant le mouseup (ex. fermeture de la modale pendant le
  // redimensionnement) : sans ça, les écouteurs resteraient sur `window`
  // jusqu'à un mouseup fortuit ailleurs dans la page.
  const activeResizeCleanupRef = useRef(null);

  useEffect(() => () => activeResizeCleanupRef.current?.(), []);

  const startResize = useCallback(
    (e, img) => {
      e.preventDefault();
      const container = formattedRef.current;
      const startX = e.clientX;
      const startWidth = img.getBoundingClientRect().width;
      const src = img.getAttribute("src");
      document.body.style.cursor = "nwse-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev) => {
        const maxWidth = container?.clientWidth ?? Infinity;
        const next = Math.min(maxWidth, Math.max(60, Math.round(startWidth + (ev.clientX - startX))));
        img.style.width = `${next}px`;
      };
      const cleanup = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        activeResizeCleanupRef.current = null;
      };
      const onUp = () => {
        cleanup();
        if (src) emitChange(setImageWidth(valueRef.current, src, Math.round(img.getBoundingClientRect().width)));
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      activeResizeCleanupRef.current = cleanup;
    },
    [emitChange]
  );

  // Enveloppe chaque image du conteneur formaté d'une poignée de
  // redimensionnement (coin bas-droit). Appelé uniquement depuis l'effet de
  // peinture (repaint complet de innerHTML), jamais après une frappe : pas
  // besoin de retirer les anciens écouteurs, ils partent avec les nœuds
  // qu'ils remplacent au prochain repaint.
  const bindImageResize = useCallback((container) => {
    container.querySelectorAll("img").forEach((img) => {
      const wrap = document.createElement("span");
      wrap.className = "trk-img-resizable";
      wrap.title = t("md_image_resize_hint");
      img.replaceWith(wrap);
      wrap.appendChild(img);
      const handle = document.createElement("span");
      handle.className = "trk-img-resize-handle";
      handle.setAttribute("aria-hidden", "true");
      wrap.appendChild(handle);
      handle.addEventListener("mousedown", (e) => startResize(e, img));
    });
  }, [startResize, t]);

  // Peint le contentEditable à partir du Markdown courant à chaque
  // changement externe (bascule vers Formaté, undo/redo, redimensionnement
  // d'image, collage) : jamais après une frappe ou une action de la barre
  // d'outils, qui ont déjà mis à jour ce même DOM elles-mêmes (`selfEditRef`)
  // - sinon le curseur sauterait à chaque caractère saisi.
  useEffect(() => {
    if (mode !== "formatted") return;
    const el = formattedRef.current;
    if (!el) return;
    if (selfEditRef.current) {
      selfEditRef.current = false;
      return;
    }
    el.innerHTML = html;
    el.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.disabled = false; });
    bindImageResize(el);
  }, [value, mode, html, bindImageResize]);

  // Coche de checklist en mode Formaté : le clic natif bascule déjà
  // `checked` (voir bindImageResize/paint : disabled est retiré), mais ne
  // déclenche pas l'évènement "input" du contentEditable - seul "change"
  // remonte depuis un <input> imbriqué.
  const handleFormattedCheckboxChange = useCallback((e) => {
    if (e.target instanceof HTMLInputElement && e.target.type === "checkbox") {
      syncFormattedToMarkdown("record");
    }
  }, [syncFormattedToMarkdown]);

  const handleFormattedInput = useCallback(() => {
    syncFormattedToMarkdown("coalesce");
  }, [syncFormattedToMarkdown]);

  // Entrée avec le curseur juste avant/après une image : voir
  // isCaretNextToImage, le Entrée natif peut ne rien faire dans ce cas
  // précis. Ailleurs, on laisse le contentEditable gérer Entrée lui-même
  // (onInput/handleFormattedInput prend le relais comme pour toute frappe).
  const handleFormattedKeyDown = useCallback((e) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return;
    const el = formattedRef.current;
    if (!el) return;
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    if (!range || !el.contains(range.commonAncestorContainer) || !isCaretNextToImage(range)) return;

    const caretRange = splitBlockAtCaret(el, range);
    if (!caretRange) return;
    e.preventDefault();
    sel.removeAllRanges();
    sel.addRange(caretRange);
    syncFormattedToMarkdown("coalesce");
  }, [syncFormattedToMarkdown]);

  const handlePaste = async (e) => {
    if (!window.images) return; // hors Electron (vite dev) : collage désactivé
    const item = Array.from(e.clipboardData?.items || []).find(
      (it) => it.kind === "file" && it.type.startsWith("image/")
    );
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;

    // Jeton unique (commentaire HTML invisible à l'aperçu) : évite qu'un
    // second collage pendant que le premier est encore en cours ne remplace
    // le mauvais espace réservé.
    const marker = `<!--img-upload:${Date.now()}-${Math.random().toString(36).slice(2, 8)}-->`;
    const pending = `_${t("md_image_uploading")}_${marker}`;
    const { text, caret } = insertAtCursor(textareaRef.current, valueRef.current, pending);
    emitChange(text);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(caret, caret));

    try {
      const buffer = await file.arrayBuffer();
      const { url } = await window.images.save(buffer);
      // "silent" : complète l'insertion du placeholder déjà enregistrée
      // ci-dessus, pour qu'un seul undo retire l'image entière.
      emitChange(valueRef.current.replace(pending, `![](${url})`), "silent");
    } catch {
      emitChange(valueRef.current.replace(pending, ""), "silent");
      onToast?.({ type: "error", text: t("md_image_paste_error") });
    }
  };

  // Équivalent de handlePaste pour le mode Formaté : le témoin d'upload est
  // un nœud DOM (retrouvé par son marqueur) plutôt qu'une sous-chaîne
  // Markdown, puisque la source de vérité éditée ici est le DOM.
  const handleFormattedPaste = async (e) => {
    if (!window.images) return;
    const item = Array.from(e.clipboardData?.items || []).find(
      (it) => it.kind === "file" && it.type.startsWith("image/")
    );
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (!file) return;
    const el = formattedRef.current;
    if (!el) return;

    const marker = `trk-upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const placeholderNode = document.createElement("em");
    placeholderNode.setAttribute("data-upload-marker", marker);
    placeholderNode.textContent = t("md_image_uploading");
    el.focus();
    ensureSelectionInside(el);
    insertNodeAtSelection(el, placeholderNode);
    syncFormattedToMarkdown();

    const marked = `[data-upload-marker="${marker}"]`;
    try {
      const buffer = await file.arrayBuffer();
      const { url } = await window.images.save(buffer);
      const node = el.querySelector(marked);
      if (node) {
        const img = document.createElement("img");
        img.setAttribute("src", url);
        node.replaceWith(img);
      }
      syncFormattedToMarkdown("silent");
    } catch {
      el.querySelector(marked)?.remove();
      syncFormattedToMarkdown("silent");
      onToast?.({ type: "error", text: t("md_image_paste_error") });
    }
  };

  const modes = [
    { id: "text", label: t("md_mode_text"), icon: Pilcrow },
    { id: "formatted", label: t("md_mode_formatted"), icon: Eye },
  ];
  return (
    <div className="trk-md-editor" onKeyDown={handleEditorKeyDown}>
      <div className="trk-md-toolbar">
        <div
          className={"trk-md-mode-toggle" + (mode === "formatted" ? " is-formatted" : "")}
          role="tablist"
          aria-label={t("field_description")}
        >
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={"trk-md-mode-btn" + (mode === m.id ? " active" : "")}
              onClick={() => onModeChange(m.id)}
            >
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>
        <a
          className="trk-md-hint"
          href="https://www.markdownguide.org/basic-syntax/"
          target="_blank"
          rel="noreferrer"
          title={t("md_syntax_hint")}
        >
          <HelpCircle size={13} /> {t("md_syntax_hint")}
        </a>
      </div>
      <div className="trk-md-format-toolbar" ref={toolbarRef}>
        <button
          type="button"
          className="trk-md-format-btn"
          title={t("md_undo")}
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="trk-md-format-btn"
          title={t("md_redo")}
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 size={14} />
        </button>
        <span className="trk-md-format-sep" aria-hidden="true" />
        <div className="trk-md-format-popover-wrap">
          <button
            type="button"
            className={"trk-md-format-btn" + (openMenu === "heading" ? " active" : "")}
            title={t("md_heading_1")}
            onClick={() => setOpenMenu(openMenu === "heading" ? null : "heading")}
          >
            <Heading1 size={14} />
          </button>
          {openMenu === "heading" && (
            <div className="trk-md-popover trk-md-heading-menu" role="menu">
              {headingOptions.map((h) => (
                <button
                  key={h.level}
                  type="button"
                  className="trk-md-menu-item"
                  title={h.title}
                  onClick={() => runFormat(h)}
                >
                  <h.icon size={14} /> {h.title}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="trk-md-format-sep" aria-hidden="true" />
        {formatGroups.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.map((btn) => (
              <button
                key={btn.id}
                type="button"
                className="trk-md-format-btn"
                title={btn.title}
                onClick={() => runFormat(btn)}
              >
                <btn.icon size={14} />
              </button>
            ))}
            <span className="trk-md-format-sep" aria-hidden="true" />
          </React.Fragment>
        ))}
        <div className="trk-md-format-popover-wrap">
          <button
            type="button"
            className={"trk-md-format-btn" + (openMenu === "color" ? " active" : "")}
            title={t("md_text_color")}
            onClick={() => setOpenMenu(openMenu === "color" ? null : "color")}
          >
            <Palette size={14} />
          </button>
          {openMenu === "color" && (
            <div className="trk-md-popover trk-md-color-menu" role="menu">
              <div className="trk-md-color-grid">
                {COLOR_PRESETS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className="trk-md-color-swatch"
                    style={{ background: hex }}
                    title={hex}
                    onClick={() => runFormat({
                      run: (v, s, e) => wrapStyle(v, s, e, `color:${hex}`, t("md_placeholder_colored")),
                      runRich: (el) => wrapSelectionInSpan(el, `color:${hex}`, t("md_placeholder_colored")),
                    })}
                  />
                ))}
              </div>
              <div className="trk-md-color-custom">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  title={t("md_text_color_custom")}
                  aria-label={t("md_text_color_custom")}
                />
                <span className="trk-md-color-custom-label">{t("md_text_color_custom")}</span>
                <button
                  type="button"
                  className="trk-md-color-apply-btn"
                  title={t("md_color_apply")}
                  aria-label={t("md_color_apply")}
                  onClick={() => runFormat({
                    run: (v, s, e) => wrapStyle(v, s, e, `color:${customColor}`, t("md_placeholder_colored")),
                    runRich: (el) => wrapSelectionInSpan(el, `color:${customColor}`, t("md_placeholder_colored")),
                  })}
                >
                  <Check size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="trk-md-format-popover-wrap">
          <button
            type="button"
            className={"trk-md-format-btn" + (openMenu === "font" ? " active" : "")}
            title={t("md_font_family")}
            onClick={() => setOpenMenu(openMenu === "font" ? null : "font")}
          >
            <Type size={14} />
          </button>
          {openMenu === "font" && (
            <div className="trk-md-popover trk-md-font-menu" role="menu">
              {FONT_OPTIONS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="trk-md-menu-item"
                  style={{ fontFamily: f.style.replace("font-family:", "") }}
                  onClick={() => runFormat({
                    run: (v, s, e) => wrapStyle(v, s, e, f.style, t("md_placeholder_styled")),
                    runRich: (el) => wrapSelectionInSpan(el, f.style, t("md_placeholder_styled")),
                  })}
                >
                  {t(f.labelKey)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="trk-md-panes">
        {mode === "text" && (
          <textarea
            ref={textareaRef}
            id={id}
            className="trk-md-textarea"
            value={value}
            onChange={(e) => emitChange(e.target.value, "coalesce")}
            onPaste={handlePaste}
            placeholder={placeholder}
          />
        )}
        {mode === "formatted" && (
          <div
            ref={formattedRef}
            id={id}
            className={"trk-md-formatted" + (!value.trim() ? " trk-md-formatted-empty" : "")}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={t("field_description")}
            data-placeholder={placeholder}
            onInput={handleFormattedInput}
            onChange={handleFormattedCheckboxChange}
            onPaste={handleFormattedPaste}
            onKeyDown={handleFormattedKeyDown}
          />
        )}
      </div>
    </div>
  );
}
