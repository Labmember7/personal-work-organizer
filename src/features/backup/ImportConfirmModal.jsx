import React from "react";
import { X } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { useEscapeKey } from "../../hooks/useEscapeKey";

// Confirmation avant remplacement des données par un import.
export function ImportConfirmModal({ pendingImport, onConfirm, onCancel }) {
  const { t } = useLang();
  useEscapeKey(onCancel, !!pendingImport);

  if (!pendingImport) return null;

  return (
    <div className="trk-modal-overlay" onClick={onCancel}>
      <div className="trk-modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("import_confirm_title")}>
        <div className="trk-modal-header">
          <span className="trk-modal-title">{t("import_confirm_title")}</span>
          <button className="trk-icon-btn" onClick={onCancel}><X size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 4px" }}>
          {t("import_confirm_body")}
        </p>
        <p className="trk-mono" style={{ fontSize: 12, color: "var(--text)" }}>
          {pendingImport.tasks.length} {t("import_task_count")} · {pendingImport.projects.length} {t("import_project_count")}
        </p>
        <div className="trk-modal-actions">
          <button type="button" className="trk-btn-secondary" onClick={onCancel}>{t("cancel")}</button>
          <button type="button" className="trk-btn-primary" onClick={onConfirm}>{t("import_confirm_action")}</button>
        </div>
      </div>
    </div>
  );
}
