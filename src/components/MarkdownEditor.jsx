import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { HelpCircle, Pilcrow, Eye, Columns2 } from "lucide-react";
import { useLang } from "../i18n.jsx";
import { renderMarkdown } from "../utils";

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

// Éditeur Markdown à trois modes (écriture / aperçu / scindé), utilisé pour
// la description d'une tâche. L'aperçu passe par renderMarkdown (assaini).
// Le collage d'une image (capture d'écran, copie depuis un explorateur…)
// est intercepté : l'image est envoyée à main.js pour redimensionnement et
// compression, puis référencée dans le Markdown via le protocole app-image:.
// Une fois affichée dans l'aperçu, l'image porte une poignée de
// redimensionnement (coin bas-droit) : la glisser met à jour le Markdown
// source (largeur figée en HTML, hauteur laissée automatique).
export function MarkdownEditor({ id, value, onChange, mode, onModeChange, placeholder, onToast }) {
  const { t } = useLang();
  const textareaRef = useRef(null);
  const previewRef = useRef(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const html = useMemo(() => renderMarkdown(value), [value]);

  const emitChange = useCallback((text) => onChangeRef.current({ target: { value: text } }), []);

  const startResize = useCallback(
    (e, img) => {
      e.preventDefault();
      const container = previewRef.current;
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
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (src) emitChange(setImageWidth(valueRef.current, src, Math.round(img.getBoundingClientRect().width)));
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [emitChange]
  );

  // Ajoute une poignée de redimensionnement à chaque image de l'aperçu.
  // Refait à chaque rendu du HTML (et à chaque bascule write/preview/split,
  // qui monte/démonte la div d'aperçu) puisque dangerouslySetInnerHTML
  // recrée les nœuds à chaque fois.
  useEffect(() => {
    const container = previewRef.current;
    if (!container) return undefined;
    const bound = [];
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
      const onDown = (e) => startResize(e, img);
      handle.addEventListener("mousedown", onDown);
      bound.push({ handle, onDown });
    });
    return () => bound.forEach(({ handle, onDown }) => handle.removeEventListener("mousedown", onDown));
  }, [html, mode, startResize, t]);

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
      emitChange(valueRef.current.replace(pending, `![](${url})`));
    } catch {
      emitChange(valueRef.current.replace(pending, ""));
      onToast?.({ type: "error", text: t("md_image_paste_error") });
    }
  };

  const modes = [
    { id: "write", label: t("md_mode_write"), icon: Pilcrow },
    { id: "preview", label: t("md_mode_preview"), icon: Eye },
    { id: "split", label: t("md_mode_split"), icon: Columns2 },
  ];
  return (
    <div className={"trk-md-editor" + (mode === "split" ? " trk-md-editor-split" : "")}>
      <div className="trk-md-toolbar">
        <div className="trk-md-tabs" role="tablist" aria-label={t("field_description")}>
          {modes.map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={mode === m.id}
              className={"trk-md-tab" + (mode === m.id ? " active" : "")}
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
      <div className="trk-md-panes">
        {mode !== "preview" && (
          <textarea
            ref={textareaRef}
            id={id}
            className="trk-md-textarea"
            value={value}
            onChange={onChange}
            onPaste={handlePaste}
            placeholder={placeholder}
          />
        )}
        {mode !== "write" && (
          <div
            ref={previewRef}
            className={"trk-md-preview" + (!value.trim() ? " trk-md-preview-empty" : "")}
            aria-label={t("md_mode_preview")}
          >
            {value.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              t("md_preview_empty")
            )}
          </div>
        )}
      </div>
    </div>
  );
}
