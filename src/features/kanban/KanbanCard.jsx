import React from "react";
import { AlertTriangle, Check, Clock, Pencil, Trash2, X, Zap } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { prioOf, projectColor, isSimpleTask, isTaskDone, formatDuration } from "../../utils";
import { useLiveMinutes } from "../focus/FocusContext.jsx";

// Carte de tâche du kanban : draggable vers les autres colonnes ou la zone
// de focus. Le temps affiché suit la session de focus en direct.
export function KanbanCard({ task, dragging, onDragStart, onDragEnd, onEdit, onDelete, confirmId, onAskDelete, onCancelDelete }) {
  const { t } = useLang();
  const pr = prioOf(task.priorite);
  const pc = projectColor(task.projet);
  const minutes = useLiveMinutes(task);
  return (
    <div
      className={"trk-kanban-card" + (dragging ? " dragging" : "") + (isTaskDone(task) ? " done" : "")}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ "--rail-color": pr.color }}
    >
      <p className="trk-kanban-card-title" title={task.titre}>{task.titre}</p>
      <div className="trk-kanban-card-meta">
        <span className="trk-tag" style={{ "--pill-color": pc }}>
          {task.projet}
        </span>
        {isSimpleTask(task) && (
          <span className="trk-type-tag"><Zap size={10} /> {t("type_simple_tag")}</span>
        )}
        <span className="trk-prio-tag" style={{ "--pill-color": pr.color }}>
          {task.priorite === "critique" && <AlertTriangle size={10} />}
          {t(`prio_${pr.id}`)}
        </span>
      </div>
      <div className="trk-kanban-card-footer">
        <span className="trk-kanban-card-info">
          {task.echeance && <span className="trk-mono">{task.echeance}</span>}
          {minutes > 0 && (
            <span className="trk-mono trk-kanban-time">
              <Clock size={10} /> {formatDuration(minutes)}
            </span>
          )}
        </span>
        <span className="trk-kanban-card-actions">
          {confirmId === task.id ? (
            <>
              <span className="trk-confirm-label">{t("delete_confirm")}</span>
              <button className="trk-icon-btn trk-icon-danger" onClick={() => onDelete(task.id)} title={t("confirm_delete_yes")} aria-label={t("confirm_delete_yes")}><Check size={12} /></button>
              <button className="trk-icon-btn" onClick={onCancelDelete} title={t("cancel")} aria-label={t("cancel")}><X size={12} /></button>
            </>
          ) : (
            <>
              <button className="trk-icon-btn" onClick={() => onEdit(task)} title={t("edit_task")}>
                <Pencil size={12} />
              </button>
              <button className="trk-icon-btn" onClick={() => onAskDelete(task.id)} title={t("remove")}>
                <Trash2 size={12} />
              </button>
            </>
          )}
        </span>
      </div>
    </div>
  );
}
