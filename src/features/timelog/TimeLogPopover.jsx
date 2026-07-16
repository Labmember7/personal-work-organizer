import React, { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { formatDuration, parseDurationInput } from "../../utils";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { useLiveMinutes } from "../focus/FocusContext.jsx";
import { TimeLogEntryRow } from "./TimeLogEntryRow.jsx";

// Popover de pointage rapide ancré sur le badge horloge d'une ligne/carte.
export function TimeLogPopover({ task, onAdd, onEdit, onDelete, onClose }) {
  const { t } = useLang();
  const ref = useRef(null);
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  // Ignore aussi le badge horloge (parent direct du popover) : fermer au
  // mousedown sur le badge rouvrait le popover au click suivant, rendant
  // le badge incapable de le refermer.
  useOutsideClick(() => (ref.current ? ref.current.parentElement || ref.current : null), onClose);

  const logs = task.timeLogs || [];
  const total = useLiveMinutes(task);

  const submit = (e) => {
    e.preventDefault();
    const minutes = parseDurationInput(duration);
    if (!minutes) {
      setError(true);
      return;
    }
    onAdd(minutes, note.trim());
    setDuration("");
    setNote("");
    setError(false);
  };

  return (
    <div className="trk-timelog-panel" ref={ref} onClick={(e) => e.stopPropagation()}>
      <div className="trk-timelog-total">
        <span>{t("time_spent")}</span>
        <span>{formatDuration(total)}</span>
      </div>
      <form className="trk-timelog-add" onSubmit={submit}>
        <input
          className="trk-timelog-duration-input"
          placeholder={t("duration_placeholder")}
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          autoFocus
        />
        <input
          className="trk-timelog-note-input"
          placeholder={t("note_placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button type="submit" className="trk-icon-btn" title={t("add")}>
          <Plus size={14} />
        </button>
      </form>
      {error && <div className="trk-timelog-error">{t("duration_format_error")}</div>}
      <div className="trk-timelog-list">
        {logs.length === 0 && <div className="trk-timelog-empty">{t("no_entry")}</div>}
        {[...logs].sort((a, b) => b.date.localeCompare(a.date)).map((l) => (
          <TimeLogEntryRow key={l.id} log={l} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    </div>
  );
}
