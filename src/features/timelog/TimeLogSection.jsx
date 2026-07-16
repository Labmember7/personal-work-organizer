import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { formatDuration, parseDurationInput } from "../../utils";
import { useLiveMinutes } from "../focus/FocusContext.jsx";
import { TimeLogEntryRow } from "./TimeLogEntryRow.jsx";

// Section de pointage inline du modal d'édition. `task` est la version du
// store (les timeLogs y font foi), pas le brouillon du modal.
export function TimeLogSection({ task, onAdd, onEdit, onDelete }) {
  const { t } = useLang();
  const [duration, setDuration] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(false);

  const logs = task.timeLogs || [];
  const total = useLiveMinutes(task);

  const submit = () => {
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

  const onEnter = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="trk-timelog-inline">
      <div className="trk-timelog-total">
        <span>{t("time_logged")}</span>
        <span>{formatDuration(total)}</span>
      </div>
      <div className="trk-timelog-add">
        <input
          className="trk-timelog-duration-input"
          placeholder={t("duration_placeholder")}
          value={duration}
          onChange={(e) => { setDuration(e.target.value); setError(false); }}
          onKeyDown={onEnter}
        />
        <input
          className="trk-timelog-note-input"
          placeholder={t("note_placeholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={onEnter}
        />
        <button type="button" className="trk-icon-btn" title={t("add")} onClick={submit}>
          <Plus size={14} />
        </button>
      </div>
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
