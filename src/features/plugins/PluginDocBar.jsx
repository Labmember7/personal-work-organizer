import React, { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLang } from "../../i18n.jsx";

// Barre de gestion des documents d'un plugin : sélection, création,
// renommage en ligne, suppression avec confirmation inline (même motif que
// TaskRow / ProjectSidebar, pour rester cohérent avec le reste de l'app).
export function PluginDocBar({ docs, activeId, onSelect, projects, scopes, onCreate, onRename, onDelete }) {
  const { t } = useLang();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newScope, setNewScope] = useState(() => (scopes.includes("global") ? "global" : projects[0] ?? ""));
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const active = docs.find((d) => d.id === activeId) || null;
  const showScopePicker = scopes.length > 1;

  const submitCreate = () => {
    if (!newScope) return;
    const title = newTitle.trim() || t("plugin_doc_untitled");
    const scope = newScope === "global" ? { kind: "global" } : { kind: "project", project: newScope };
    onCreate(title, scope);
    setCreating(false);
    setNewTitle("");
  };

  const startRename = () => {
    if (!active) return;
    setRenameValue(active.title);
    setRenaming(true);
  };

  const submitRename = () => {
    if (active && renameValue.trim()) onRename(active.id, renameValue);
    setRenaming(false);
  };

  const confirmDelete = () => {
    if (active) onDelete(active.id);
    setConfirmingDelete(false);
  };

  return (
    <div className="trk-plugin-docbar">
      {renaming ? (
        <div className="trk-add-project-row">
          <input
            className="trk-add-project-input"
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
          <button className="trk-icon-btn" onClick={submitRename} title={t("save")} aria-label={t("save")}>
            <Check size={14} />
          </button>
          <button className="trk-icon-btn" onClick={() => setRenaming(false)} title={t("cancel")} aria-label={t("cancel")}>
            <X size={14} />
          </button>
        </div>
      ) : (
        <select
          className="trk-select trk-plugin-doc-select"
          value={activeId ?? ""}
          onChange={(e) => onSelect(e.target.value || null)}
          disabled={docs.length === 0}
          aria-label={t("plugin_doc_select")}
        >
          {docs.length === 0 && <option value="">{t("plugin_doc_none")}</option>}
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || t("plugin_doc_untitled")}
              {d.scope.kind === "project" ? ` · ${d.scope.project}` : ""}
            </option>
          ))}
        </select>
      )}

      {active && !renaming && (
        <>
          <button className="trk-icon-btn" onClick={startRename} title={t("plugin_doc_rename")} aria-label={t("plugin_doc_rename")}>
            <Pencil size={14} />
          </button>
          {confirmingDelete ? (
            <div className="trk-confirm">
              <span className="trk-confirm-label">{t("plugin_doc_delete_confirm")}</span>
              <button
                className="trk-icon-btn trk-icon-danger"
                onClick={confirmDelete}
                title={t("confirm_delete_yes")}
                aria-label={t("confirm_delete_yes")}
              >
                <Check size={14} />
              </button>
              <button
                className="trk-icon-btn"
                onClick={() => setConfirmingDelete(false)}
                title={t("cancel")}
                aria-label={t("cancel")}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              className="trk-icon-btn"
              onClick={() => setConfirmingDelete(true)}
              title={t("plugin_doc_delete")}
              aria-label={t("plugin_doc_delete")}
            >
              <Trash2 size={14} />
            </button>
          )}
        </>
      )}

      <div className="trk-plugin-docbar-spacer" />

      {creating ? (
        <div className="trk-add-project-row">
          <input
            autoFocus
            className="trk-add-project-input"
            placeholder={t("plugin_doc_title_placeholder")}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
          />
          {showScopePicker && (
            <select className="trk-select" value={newScope} onChange={(e) => setNewScope(e.target.value)}>
              {scopes.includes("global") && <option value="global">{t("plugin_scope_global")}</option>}
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          <button className="trk-icon-btn" onClick={submitCreate} title={t("add")} aria-label={t("add")}>
            <Check size={15} />
          </button>
          <button className="trk-icon-btn" onClick={() => setCreating(false)} title={t("cancel")} aria-label={t("cancel")}>
            <X size={15} />
          </button>
        </div>
      ) : (
        <button type="button" className="trk-ghost-btn" onClick={() => setCreating(true)}>
          <Plus size={13} /> {t("plugin_doc_new")}
        </button>
      )}
    </div>
  );
}
