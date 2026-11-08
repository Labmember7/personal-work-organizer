import React, { useState } from "react";
import { AnimatedNumber } from "../../components/AnimatedNumber.jsx";
import { AlertTriangle, Check, Pencil, X } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { formatDuration, parseDurationInput } from "../../utils";

// Ligne d'historique éditable : bascule entre affichage et formulaire
// d'édition (durée + note), partagée par le popover et la section inline.
export function TimeLogEntryRow({ log, onEdit, onDelete }) {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const startEdit = () => {
    setDuration(formatDuration(log.minutes));
    setNote(log.note || "");
    setError(false);
    setEditing(true);
  };

  const save = () => {
    const minutes = parseDurationInput(duration);
    if (!minutes) {
      setError(true);
      return;
    }
    onEdit(log.id, minutes, note.trim());
    setEditing(false);
  };

  const onEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="trk-timelog-entry trk-timelog-entry-edit">
        <input
          className={"trk-timelog-duration-input" + (error ? " trk-input-error" : "")}
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          onKeyDown={onEnter}
          autoFocus
        />
        <input
          className="trk-timelog-note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onEnter}
        />
        <button type="button" className="trk-icon-btn" onClick={save} title={t("save")}>
          <Check size={12} />
        </button>
        <button type="button" className="trk-icon-btn" onClick={() => setEditing(false)} title={t("cancel")}>
          <X size={12} />
        </button>
        {error && (
          <div className="trk-error-bubble trk-timelog-error" role="alert">
            <span className="trk-error-bubble-tip" />
            <span className="trk-error-bubble-icon"><AlertTriangle size={12} /></span>
            <span>{t("duration_format_error")}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="trk-timelog-entry">
      <span className="trk-timelog-entry-info">
        <strong><AnimatedNumber value={formatDuration(log.minutes)} /></strong> · {log.date}{log.note ? ` · ${log.note}` : ""}
      </span>
      <button type="button" className="trk-icon-btn" onClick={startEdit} title={t("edit_entry")}>
        <Pencil size={12} />
      </button>
      <button type="button" className="trk-icon-btn" onClick={() => onDelete(log.id)} title={t("remove")}>
        <X size={12} />
      </button>
    </div>
  );
}
