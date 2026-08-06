import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HelpCircle, Pilcrow, Eye,
  Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3, Quote,
  List, ListOrdered, ListChecks, Link2, Image as ImageIcon, Minus, Table,
  Code, SquareCode, Palette, Type, Undo2, Redo2, Check,
} from "lucide-react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useLang } from "../i18n.jsx";
import { createEditorExtensions } from "../lib/editorExtensions";
import { editorHtmlToMarkdown, markdownToEditorHtml } from "../lib/editorContent";
import { addUploadPlaceholder, findUploadPlaceholder, removeUploadPlaceholder } from "../lib/editorUpload";

const COLOR_PRESETS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#0ea5e9", "#6366f1", "#a855f7", "#64748b",
];

// `family: ""` = option "Par défaut", qui retire la police appliquée au lieu
// d'en poser une nouvelle.
const FONT_OPTIONS = [
  { id: "default", family: "", labelKey: "md_font_default" },
  { id: "sans", family: "'Inter',sans-serif", labelKey: "md_font_sans" },
  { id: "serif", family: "Georgia,'Times New Roman',serif", labelKey: "md_font_serif" },
  { id: "mono", family: "'JetBrains Mono','Space Mono',monospace", labelKey: "md_font_mono" },
  { id: "hand", family: "'Segoe Print','Bradley Hand',cursive", labelKey: "md_font_hand" },
];

// Raccourcis clavier de la barre d'outils, façon Jira. Les touches chiffrées
// sont reconnues par leur position physique (`code`) et non par le caractère
// produit : Ctrl+Shift+8 n'envoie pas le même `key` en AZERTY et en QWERTY.
// Ctrl+Alt est volontairement évité : c'est AltGr sur les claviers
// francophones, il sert à taper #, [, | … dans le texte.
const matchesShortcut = (e, shortcut) => {
  if (!shortcut || !(e.ctrlKey || e.metaKey)) return false;
  if (!!shortcut.shift !== e.shiftKey || e.altKey) return false;
  return shortcut.code ? e.code === shortcut.code : e.key.toLowerCase() === shortcut.key;
};

const shortcutLabel = (shortcut) => {
  if (!shortcut) return "";
  const keyName = shortcut.code ? shortcut.code.replace("Digit", "") : shortcut.key.toUpperCase();
  return ["Ctrl", shortcut.shift ? "Shift" : null, keyName].filter(Boolean).join("+");
};

const withShortcut = (title, shortcut) => (shortcut ? `${title} (${shortcutLabel(shortcut)})` : title);

// Tableau 2x2 (en-tête + une ligne), comme l'ancienne insertion Markdown : les
// cellules portent un texte d'exemple pour être visibles et remplaçables.
const tableHtml = (t) =>
  `<table><tbody><tr><th>${t("md_table_header")}</th><th>${t("md_table_header")}</th></tr>` +
  `<tr><td>${t("md_table_cell")}</td><td>${t("md_table_cell")}</td></tr></tbody></table>`;

function imageFileFrom(clipboardData) {
  const item = Array.from(clipboardData?.items || []).find(
    (it) => it.kind === "file" && it.type.startsWith("image/")
  );
  return item?.getAsFile() ?? null;
}

// Éditeur de description à bascule Texte/Formaté (façon Jira). "Texte" édite
// la source Markdown brute dans un textarea ; "Formaté" est un éditeur riche
// Tiptap (ProseMirror) dont la barre d'outils, les raccourcis, les règles de
// saisie ("- ", "1. ", "# ", "> ", "[] ") et l'historique undo/redo viennent
// des extensions - voir lib/editorExtensions.ts.
// La source de vérité (`value`) reste dans les deux modes la même chaîne
// Markdown : lib/editorContent.ts la traduit vers/depuis le HTML de Tiptap
// (renderMarkdown pour l'assainissement, Turndown pour le retour).
// Le document Tiptap n'est réécrit qu'après un changement externe (bascule de
// mode, tâche suivante) : après une frappe ou une action de la barre d'outils
// il est déjà à jour (syncedRef) - le réécrire ferait sauter le curseur.
// Le collage d'une image (capture d'écran, copie depuis un explorateur…) est
// intercepté dans les deux modes : l'image est envoyée à main.js pour
// redimensionnement et compression, puis référencée dans le Markdown via le
// protocole app-image:. En mode Formaté, l'image porte une poignée de
// redimensionnement (voir lib/editorImage.ts).
export function MarkdownEditor({ id, value, onChange, mode, onModeChange, placeholder, onToast }) {
  const { t } = useLang();
  const textareaRef = useRef(null);
  const toolbarRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null); // null | "heading" | "color" | "font" | "link" | "image"
  const [customColor, setCustomColor] = useState("#000000");
  const [urlDraft, setUrlDraft] = useState("");

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onToastRef = useRef(onToast);
  onToastRef.current = onToast;
  // Libellés relus à la demande : l'éditeur n'est créé qu'une fois, la langue
  // peut changer après.
  const tRef = useRef(t);
  tRef.current = t;
  const placeholderRef = useRef(placeholder);
  placeholderRef.current = placeholder;

  // Dernier Markdown produit par l'éditeur formaté : tant que `value` lui est
  // égal, le document Tiptap est déjà à jour (voir l'effet de synchronisation).
  const syncedRef = useRef(value);
  const pasteImageRef = useRef(null);

  const extensions = useMemo(
    () => createEditorExtensions({
      placeholder: () => placeholderRef.current ?? "",
      resizeHint: () => tRef.current("md_image_resize_hint"),
    }),
    []
  );

  const editor = useEditor(
    {
      extensions,
      content: markdownToEditorHtml(valueRef.current),
      editorProps: {
        attributes: {
          class: "trk-md-formatted",
          role: "textbox",
          "aria-multiline": "true",
          ...(id ? { id } : {}),
        },
        handlePaste: (_view, event) => pasteImageRef.current?.(event) === true,
      },
      onUpdate: ({ editor: instance }) => {
        const markdown = editorHtmlToMarkdown(instance.getHTML());
        syncedRef.current = markdown;
        onChangeRef.current({ target: { value: markdown } });
      },
    },
    []
  );

  // Mises en forme sous le curseur : allume les boutons correspondants pour
  // savoir où l'on en est en enchaînant les formats. Le sélecteur ne
  // re-rend le composant que quand l'un de ces drapeaux change.
  const formats = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e && {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        code: e.isActive("code"),
        codeBlock: e.isActive("codeBlock"),
        quote: e.isActive("blockquote"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        task: e.isActive("taskList"),
        link: e.isActive("link"),
        h1: e.isActive("heading", { level: 1 }),
        h2: e.isActive("heading", { level: 2 }),
        h3: e.isActive("heading", { level: 3 }),
        // "Paragraphe" ne s'allume que sur un paragraphe nu : dans une liste ou
        // une citation, c'est l'action qui les retire.
        paragraph:
          e.isActive("paragraph") &&
          !e.isActive("bulletList") &&
          !e.isActive("orderedList") &&
          !e.isActive("taskList") &&
          !e.isActive("blockquote"),
      },
  });

  useEffect(() => {
    editor?.view.dom.setAttribute("aria-label", t("field_description"));
  }, [editor, t]);

  // Changement externe de la description (bascule depuis le mode Texte, tâche
  // suivante) : on repeint le document. Après une frappe ou une action de la
  // barre d'outils, `value` vient de l'éditeur lui-même et il n'y a rien à
  // faire.
  useEffect(() => {
    if (!editor || mode !== "formatted" || value === syncedRef.current) return;
    syncedRef.current = value;
    editor.commands.setContent(markdownToEditorHtml(value), { emitUpdate: false });
  }, [editor, value, mode]);

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

  // Une entrée de barre d'outils, c'est soit une commande Tiptap appliquée à
  // la sélection courante (`run`), soit l'ouverture d'un menu (`menu`).
  const runFormat = useCallback((item) => {
    if (!editor) return;
    if (item.menu) {
      setOpenMenu((open) => (open === item.menu ? null : item.menu));
      return;
    }
    item.run(editor.chain().focus()).run();
    setOpenMenu(null);
  }, [editor]);

  const formatGroups = useMemo(() => [
    [
      { id: "bold", icon: Bold, title: t("md_bold"), shortcut: { key: "b" }, active: "bold", run: (c) => c.toggleBold() },
      { id: "italic", icon: Italic, title: t("md_italic"), shortcut: { key: "i" }, active: "italic", run: (c) => c.toggleItalic() },
      { id: "underline", icon: Underline, title: t("md_underline"), shortcut: { key: "u" }, active: "underline", run: (c) => c.toggleUnderline() },
      { id: "strike", icon: Strikethrough, title: t("md_strike"), shortcut: { key: "s", shift: true }, active: "strike", run: (c) => c.toggleStrike() },
    ],
    [
      { id: "quote", icon: Quote, title: t("md_quote"), shortcut: { code: "Digit9", shift: true }, active: "quote", run: (c) => c.toggleBlockquote() },
      { id: "bullet", icon: List, title: t("md_bullet_list"), shortcut: { code: "Digit8", shift: true }, active: "bullet", run: (c) => c.toggleBulletList() },
      { id: "ordered", icon: ListOrdered, title: t("md_ordered_list"), shortcut: { code: "Digit7", shift: true }, active: "ordered", run: (c) => c.toggleOrderedList() },
      { id: "checklist", icon: ListChecks, title: t("md_checklist"), shortcut: { code: "Digit4", shift: true }, active: "task", run: (c) => c.toggleTaskList() },
    ],
    [
      { id: "link", icon: Link2, title: t("md_link"), shortcut: { key: "k" }, active: "link", menu: "link" },
      { id: "image", icon: ImageIcon, title: t("md_image_insert"), menu: "image" },
      { id: "code", icon: Code, title: t("md_code_inline"), shortcut: { key: "e" }, active: "code", run: (c) => c.toggleCode() },
      { id: "codeblock", icon: SquareCode, title: t("md_code_block"), shortcut: { key: "m", shift: true }, active: "codeBlock", run: (c) => c.toggleCodeBlock() },
    ],
    [
      { id: "table", icon: Table, title: t("md_table"), run: (c) => c.insertContent(tableHtml(t)) },
      { id: "hr", icon: Minus, title: t("md_divider"), run: (c) => c.setHorizontalRule() },
    ],
  ], [t]);

  const headingOptions = useMemo(() => [
    // clearNodes : ramène la sélection à un paragraphe nu, en retirant aussi
    // la liste ou la citation qui l'enveloppait.
    { level: 0, icon: Pilcrow, title: t("md_paragraph"), shortcut: { code: "Digit0", shift: true }, active: "paragraph", run: (c) => c.clearNodes() },
    { level: 1, icon: Heading1, title: t("md_heading_1"), shortcut: { code: "Digit1", shift: true }, active: "h1", run: (c) => c.toggleHeading({ level: 1 }) },
    { level: 2, icon: Heading2, title: t("md_heading_2"), shortcut: { code: "Digit2", shift: true }, active: "h2", run: (c) => c.toggleHeading({ level: 2 }) },
    { level: 3, icon: Heading3, title: t("md_heading_3"), shortcut: { code: "Digit3", shift: true }, active: "h3", run: (c) => c.toggleHeading({ level: 3 }) },
  ], [t]);

  // La barre d'outils n'agit que sur l'éditeur riche : en mode Texte, la
  // source affichée montre déjà ses marqueurs et s'édite au clavier.
  const isRich = mode === "formatted";
  const isActive = useCallback(
    (item) => isRich && !!item.active && !!formats?.[item.active],
    [isRich, formats]
  );

  const shortcutItems = useMemo(
    () => [...formatGroups.flat(), ...headingOptions].filter((item) => item.shortcut),
    [formatGroups, headingOptions]
  );

  // Raccourcis absents des extensions Tiptap (Ctrl+Shift+8, Ctrl+K…). Les
  // raccourcis natifs (Ctrl+B, Ctrl+Z…) ont déjà agi quand l'évènement remonte
  // jusqu'ici : sans le garde-fou defaultPrevented, la mise en forme serait
  // appliquée deux fois, donc annulée.
  const handleEditorKeyDown = useCallback((e) => {
    if (!isRich || e.defaultPrevented) return;
    const item = shortcutItems.find((candidate) => matchesShortcut(e, candidate.shortcut));
    if (!item) return;
    e.preventDefault();
    runFormat(item);
  }, [isRich, shortcutItems, runFormat]);

  const applyUrl = useCallback(() => {
    const url = urlDraft.trim();
    if (!editor || !url) return;
    const chain = editor.chain().focus();
    if (openMenu === "image") chain.setImage({ src: url }).run();
    else if (editor.state.selection.empty) {
      chain.insertContent({
        type: "text",
        text: t("md_placeholder_link_label"),
        marks: [{ type: "link", attrs: { href: url } }],
      }).run();
    } else {
      chain.extendMarkRange("link").setLink({ href: url }).run();
    }
    setUrlDraft("");
    setOpenMenu(null);
  }, [editor, openMenu, urlDraft, t]);

  // Le témoin d'upload est une décoration ProseMirror (voir lib/editorUpload):
  // sa position suit les frappes pendant l'enregistrement de l'image, et deux
  // collages simultanés ne se marchent pas dessus.
  const uploadImage = useCallback(async (file) => {
    if (!editor) return;
    const marker = {};
    editor.view.dispatch(addUploadPlaceholder(editor.state, marker, t("md_image_uploading")));
    try {
      const buffer = await file.arrayBuffer();
      const { url } = await window.images.save(buffer);
      const pos = findUploadPlaceholder(editor.state, marker);
      editor.view.dispatch(removeUploadPlaceholder(editor.state, marker));
      if (pos !== null) editor.chain().focus().insertContentAt(pos, { type: "image", attrs: { src: url } }).run();
    } catch {
      editor.view.dispatch(removeUploadPlaceholder(editor.state, marker));
      onToastRef.current?.({ type: "error", text: t("md_image_paste_error") });
    }
  }, [editor, t]);

  pasteImageRef.current = (event) => {
    if (!window.images) return false; // hors Electron (vite dev) : collage natif
    const file = imageFileFrom(event.clipboardData);
    if (!file) return false;
    uploadImage(file);
    return true;
  };

  const handleTextareaPaste = async (e) => {
    if (!window.images) return;
    const file = imageFileFrom(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    const el = textareaRef.current;
    const start = el?.selectionStart ?? valueRef.current.length;
    const end = el?.selectionEnd ?? valueRef.current.length;
    try {
      const buffer = await file.arrayBuffer();
      const { url } = await window.images.save(buffer);
      const markdown = `![](${url})`;
      onChangeRef.current({
        target: { value: valueRef.current.slice(0, start) + markdown + valueRef.current.slice(end) },
      });
      const caret = start + markdown.length;
      requestAnimationFrame(() => el?.setSelectionRange(caret, caret));
    } catch {
      onToastRef.current?.({ type: "error", text: t("md_image_paste_error") });
    }
  };

  // La barre d'outils ne doit jamais prendre le focus : sans ça, le premier
  // clic déplacerait la sélection hors de l'éditeur et la mise en forme
  // s'appliquerait à côté (ou pas du tout).
  const keepSelection = (e) => e.preventDefault();

  const modes = [
    { id: "text", label: t("md_mode_text"), icon: Pilcrow },
    { id: "formatted", label: t("md_mode_formatted"), icon: Eye },
  ];

  const switchMode = (next) => {
    setOpenMenu(null);
    setUrlDraft("");
    onModeChange(next);
  };

  const urlPopover = (
    <div className="trk-md-popover trk-md-url-menu" role="menu">
      <input
        className="trk-md-url-input"
        type="text"
        autoFocus
        value={urlDraft}
        placeholder={t("md_placeholder_url")}
        aria-label={t("md_prompt_url")}
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => setUrlDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key !== "Enter") return;
          e.preventDefault();
          applyUrl();
        }}
      />
      <button
        type="button"
        className="trk-md-color-apply-btn"
        title={t("md_insert")}
        aria-label={t("md_insert")}
        onClick={applyUrl}
      >
        <Check size={14} />
      </button>
    </div>
  );

  return (
    <div className="trk-md-editor" onKeyDown={handleEditorKeyDown}>
      <div className="trk-md-toolbar">
        <div
          className={"trk-md-mode-toggle" + (isRich ? " is-formatted" : "")}
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
              onClick={() => switchMode(m.id)}
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
      <div className="trk-md-format-toolbar" ref={toolbarRef} onMouseDown={keepSelection}>
        <button
          type="button"
          className="trk-md-format-btn"
          title={t("md_undo")}
          disabled={!isRich || !formats?.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 size={14} />
        </button>
        <button
          type="button"
          className="trk-md-format-btn"
          title={t("md_redo")}
          disabled={!isRich || !formats?.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 size={14} />
        </button>
        <span className="trk-md-format-sep" aria-hidden="true" />
        <div className="trk-md-format-popover-wrap">
          <button
            type="button"
            className={"trk-md-format-btn" + (openMenu === "heading" ? " active" : "")}
            title={t("md_block_style")}
            disabled={!isRich}
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
                  className={"trk-md-menu-item" + (isActive(h) ? " active" : "")}
                  title={withShortcut(h.title, h.shortcut)}
                  onClick={() => runFormat(h)}
                >
                  <h.icon size={14} /> {h.title}
                  <span className="trk-md-menu-shortcut">{shortcutLabel(h.shortcut)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="trk-md-format-sep" aria-hidden="true" />
        {formatGroups.map((group, gi) => (
          <React.Fragment key={gi}>
            {group.map((btn) => {
              const button = (
                <button
                  key={btn.id}
                  type="button"
                  className={"trk-md-format-btn" + (isActive(btn) || openMenu === btn.menu ? " active" : "")}
                  title={withShortcut(btn.title, btn.shortcut)}
                  aria-pressed={btn.active ? isActive(btn) : undefined}
                  disabled={!isRich}
                  onClick={() => runFormat(btn)}
                >
                  <btn.icon size={14} />
                </button>
              );
              if (!btn.menu) return button;
              return (
                <div className="trk-md-format-popover-wrap" key={btn.id}>
                  {button}
                  {openMenu === btn.menu && urlPopover}
                </div>
              );
            })}
            <span className="trk-md-format-sep" aria-hidden="true" />
          </React.Fragment>
        ))}
        <div className="trk-md-format-popover-wrap">
          <button
            type="button"
            className={"trk-md-format-btn" + (openMenu === "color" ? " active" : "")}
            title={t("md_text_color")}
            disabled={!isRich}
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
                    onClick={() => runFormat({ run: (c) => c.setColor(hex) })}
                  />
                ))}
              </div>
              <div className="trk-md-color-custom">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  title={t("md_text_color_custom")}
                  aria-label={t("md_text_color_custom")}
                />
                <span className="trk-md-color-custom-label">{t("md_text_color_custom")}</span>
                <button
                  type="button"
                  className="trk-md-color-apply-btn"
                  title={t("md_color_apply")}
                  aria-label={t("md_color_apply")}
                  onClick={() => runFormat({ run: (c) => c.setColor(customColor) })}
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
            disabled={!isRich}
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
                  style={f.family ? { fontFamily: f.family } : undefined}
                  onClick={() => runFormat({
                    run: (c) => (f.family ? c.setFontFamily(f.family) : c.unsetFontFamily()),
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
            onChange={(e) => onChange(e)}
            onPaste={handleTextareaPaste}
            placeholder={placeholder}
          />
        )}
        {isRich && <EditorContent editor={editor} className="trk-md-pane-rich" />}
      </div>
    </div>
  );
}
