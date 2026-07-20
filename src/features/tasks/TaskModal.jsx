import React, { useRef, useState } from "react";
import { X, Columns3, Zap } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { PRIORITIES, isSimpleTask, statusesForTask } from "../../utils";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { MarkdownEditor } from "../../components/MarkdownEditor.jsx";
import { TimeLogSection } from "../timelog/TimeLogSection.jsx";

// Modal de création/édition d'une tâche. Le composant possède son brouillon
// (copie de `initial`) ; la fermeture demande confirmation si le brouillon a
// été modifié. Les timeLogs ne passent pas par le brouillon : la section de
// pointage lit `storeTask` (version du store) et mute via timeLogOps.
export function TaskModal({ initial, storeTask, projects, onSubmit, onClose, timeLogOps, onToast }) {
  const { t } = useLang();
  const [draft, setDraft] = useState(initial);
  const [descMode, setDescMode] = useState("write");
  const [confirmClose, setConfirmClose] = useState(false);
  const initialRef = useRef(initial);

  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(initialRef.current);

  const requestClose = () => {
    if (isDirty()) setConfirmClose(true);
    else onClose();
  };

  useEscapeKey(() => {
    if (confirmClose) setConfirmClose(false);
    else requestClose();
  });

  const submit = (e) => {
    e.preventDefault();
    if (!draft.titre.trim() || !draft.projet.trim()) return;
    onSubmit(draft);
    onClose();
  };

  return (
    <div className="trk-modal-overlay" onClick={requestClose}>
      <div
        className="trk-modal trk-modal-task"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={draft.id ? t("edit_task") : t("new_task")}
      >
        <div className="trk-modal-header">
          <span className="trk-modal-title">{draft.id ? t("edit_task") : t("new_task")}</span>
          <button className="trk-icon-btn" onClick={requestClose}><X size={16} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="trk-modal-task-body">
            <div className="trk-modal-task-main">
              <div className="trk-field">
                <label>{t("field_title")}</label>
                <input
                  autoFocus
                  value={draft.titre}
                  onChange={(e) => setDraft({ ...draft, titre: e.target.value })}
                  placeholder={t("title_placeholder")}
                  required
                />
              </div>
              <div className="trk-field trk-field-description">
                <label htmlFor="task-description">{t("field_description")}</label>
                <MarkdownEditor
                  id="task-description"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  mode={descMode}
                  onModeChange={setDescMode}
                  placeholder={t("description_placeholder")}
                  onToast={onToast}
                />
              </div>
            </div>
            <div className="trk-modal-task-side">
              {!draft.id && (
                <div className="trk-field">
                  <label>{t("field_type")}</label>
                  <div className="trk-type-switch">
                    <button
                      type="button"
                      className={!isSimpleTask(draft) ? "active" : ""}
                      onClick={() => setDraft({ ...draft, type: "standard", statut: "analyser" })}
                      aria-pressed={!isSimpleTask(draft)}
                    >
                      <Columns3 size={13} /> {t("type_standard")}
                    </button>
                    <button
                      type="button"
                      className={isSimpleTask(draft) ? "active" : ""}
                      onClick={() => setDraft({ ...draft, type: "simple", statut: "todo" })}
                      aria-pressed={isSimpleTask(draft)}
                    >
                      <Zap size={13} /> {t("type_simple")}
                    </button>
                  </div>
                </div>
              )}
              <div className="trk-field">
                <label>{t("field_project")}</label>
                <select
                  value={draft.projet}
                  onChange={(e) => setDraft({ ...draft, projet: e.target.value })}
                >
                  {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="trk-field">
                <label>{t("field_priority")}</label>
                <select
                  value={draft.priorite}
                  onChange={(e) => setDraft({ ...draft, priorite: e.target.value })}
                >
                  {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{t(`prio_${p.id}`)}</option>)}
                </select>
              </div>
              <div className="trk-field">
                <label>{t("field_status")}</label>
                <select
                  value={draft.statut}
                  onChange={(e) => setDraft({ ...draft, statut: e.target.value })}
                >
                  {statusesForTask(draft).map((s) => <option key={s.id} value={s.id}>{t(`status_${s.id}`)}</option>)}
                </select>
              </div>
              <div className="trk-field">
                <label>{t("field_start")}</label>
                <input
                  type="date"
                  value={draft.dateDebut || ""}
                  onChange={(e) => setDraft({ ...draft, dateDebut: e.target.value })}
                />
              </div>
              <div className="trk-field">
                <label>{t("field_due")}</label>
                <input
                  type="date"
                  value={draft.echeance}
                  onChange={(e) => setDraft({ ...draft, echeance: e.target.value })}
                />
              </div>
              <div className="trk-field">
                <label>{t("field_assignee")}</label>
                <input
                  value={draft.assigne}
                  onChange={(e) => setDraft({ ...draft, assigne: e.target.value })}
                  placeholder={t("assignee_placeholder")}
                />
              </div>
              {draft.id && storeTask ? (
                <div className="trk-field">
                  <label>{t("field_time")}</label>
                  <TimeLogSection
                    task={storeTask}
                    onAdd={(minutes, note) => timeLogOps.addTimeLog(draft.id, minutes, note)}
                    onEdit={(logId, minutes, note) => timeLogOps.editTimeLog(draft.id, logId, minutes, note)}
                    onDelete={(logId) => timeLogOps.deleteTimeLog(draft.id, logId)}
                  />
                </div>
              ) : (
                <div className="trk-timelog-hint">{t("time_hint")}</div>
              )}
            </div>
          </div>
          <div className="trk-modal-actions">
            <button type="button" className="trk-btn-secondary" onClick={requestClose}>{t("cancel")}</button>
            <button type="submit" className="trk-btn-primary">{draft.id ? t("save") : t("add")}</button>
          </div>
        </form>
      </div>

      {confirmClose && (
        <div className="trk-modal-overlay trk-modal-overlay-nested" onClick={() => setConfirmClose(false)}>
          <div
            className="trk-modal"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            aria-label={t("unsaved_changes_title")}
          >
            <div className="trk-modal-header">
              <span className="trk-modal-title">{t("unsaved_changes_title")}</span>
              <button className="trk-icon-btn" onClick={() => setConfirmClose(false)}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "0 0 4px" }}>
              {t("unsaved_changes_body")}
            </p>
            <div className="trk-modal-actions">
              <button type="button" className="trk-btn-secondary" onClick={() => setConfirmClose(false)}>{t("keep_editing")}</button>
              <button type="button" className="trk-btn-danger" onClick={onClose}>{t("discard_changes")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
