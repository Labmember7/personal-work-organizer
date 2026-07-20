import React, { useState } from "react";
import { AlertTriangle, Check, Clock, Flame, Pencil, Trash2, X, Zap } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import {
  statusOf, prioOf, projectColor, isSimpleTask, isTaskDone, formatDuration,
} from "../../utils";
import { useFocusInfo, useLiveMinutes } from "../focus/FocusContext.jsx";
import { TimeLogPopover } from "../timelog/TimeLogPopover.jsx";

// Ligne de la vue liste : draggable vers la zone de focus, badge horloge
// ouvrant le popover de pointage, suppression avec confirmation inline.
export function TaskRow({ task, onEdit, onDelete, confirmId, onAskDelete, onCancelDelete, timeLogOps }) {
  const { t } = useLang();
  const [logOpen, setLogOpen] = useState(false);
  const st = statusOf(task.statut);
  const pr = prioOf(task.priorite);
  const pc = projectColor(task.projet);
  const minutes = useLiveMinutes(task);
  const { focusId } = useFocusInfo();
  const isFocused = focusId === task.id;

  return (
    <div
      className={"trk-task-row" + (isTaskDone(task) ? " done" : "") + (isFocused ? " trk-focused" : "")}
      style={{ "--rail-color": pr.color }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="trk-task-main">
        <p className="trk-task-title">
          {isFocused && <Flame size={12} className="trk-focused-flame" aria-hidden="true" />}
          {task.titre}
        </p>
        <div className="trk-task-meta">
          <span className="trk-tag" style={{ "--pill-color": pc }}>{task.projet}</span>
          {isSimpleTask(task) && (
            <span className="trk-type-tag"><Zap size={10} /> {t("type_simple_tag")}</span>
          )}
          <span className="trk-prio-tag" style={{ "--pill-color": pr.color }}>
            {task.priorite === "critique" && <AlertTriangle size={11} />}
            {t(`prio_${pr.id}`)}
          </span>
          <span className="trk-status-pill" style={{ "--pill-color": st.color }}>
            {t(`status_${st.id}`)}
          </span>
          {task.assigne && <span>{task.assigne}</span>}
          {task.echeance && <span className="trk-mono">{task.echeance}</span>}
          <div className="trk-timelog-wrap">
            <button
              type="button"
              className={"trk-time-badge" + (minutes ? " has-time" : "")}
              onClick={(e) => {
                e.stopPropagation();
                setLogOpen((o) => !o);
              }}
              title={t("record_time")}
            >
              <Clock size={11} /> {formatDuration(minutes)}
            </button>
            {logOpen && (
              <TimeLogPopover
                task={task}
                onAdd={(minutes, note) => timeLogOps.addTimeLog(task.id, minutes, note)}
                onEdit={(logId, minutes, note) => timeLogOps.editTimeLog(task.id, logId, minutes, note)}
                onDelete={(logId) => timeLogOps.deleteTimeLog(task.id, logId)}
                onClose={() => setLogOpen(false)}
              />
            )}
          </div>
        </div>
      </div>
      <div className="trk-task-actions">
        {confirmId === task.id ? (
          <div className="trk-confirm">
            <span className="trk-confirm-label">{t("delete_confirm")}</span>
            <button className="trk-icon-btn trk-icon-danger" onClick={() => onDelete(task.id)} title={t("confirm_delete_yes")} aria-label={t("confirm_delete_yes")}><Check size={14} /></button>
            <button className="trk-icon-btn" onClick={onCancelDelete} title={t("cancel")} aria-label={t("cancel")}><X size={14} /></button>
          </div>
        ) : (
          <>
            <button className="trk-icon-btn" onClick={() => onEdit(task)} title={t("edit_task")} aria-label={t("edit_task")}><Pencil size={14} /></button>
            <button className="trk-icon-btn" onClick={() => onAskDelete(task.id)} title={t("remove")} aria-label={t("remove")}><Trash2 size={14} /></button>
          </>
        )}
      </div>
    </div>
  );
}
