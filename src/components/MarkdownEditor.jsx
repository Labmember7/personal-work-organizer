import React, { useMemo } from "react";
import { HelpCircle, Pilcrow, Eye, Columns2 } from "lucide-react";
import { useLang } from "../i18n.jsx";
import { renderMarkdown } from "../utils";

// Éditeur Markdown à trois modes (écriture / aperçu / scindé), utilisé pour
// la description d'une tâche. L'aperçu passe par renderMarkdown (assaini).
export function MarkdownEditor({ id, value, onChange, mode, onModeChange, placeholder }) {
  const { t } = useLang();
  const html = useMemo(() => renderMarkdown(value), [value]);
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
            id={id}
            className="trk-md-textarea"
            value={value}
            onChange={onChange}
            placeholder={placeholder}
          />
        )}
        {mode !== "write" && (
          <div
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
