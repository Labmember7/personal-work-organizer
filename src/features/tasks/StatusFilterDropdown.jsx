import React, { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLang, statusCountLabel } from "../../i18n.jsx";
import { CHART_STATUSES } from "../../utils";
import { useOutsideClick } from "../../hooks/useOutsideClick";

// Filtre multi-sélection par statut de la barre d'outils.
export function StatusFilterDropdown({ selected, onToggle, onClear }) {
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useOutsideClick(ref, () => setOpen(false), open);

  const label = statusCountLabel(t, lang, selected.length);

  return (
    <div className="trk-multiselect" ref={ref}>
      <button
        type="button"
        className={"trk-select trk-multiselect-btn" + (selected.length ? " active" : "")}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="trk-multiselect-panel">
          {CHART_STATUSES.map((s) => (
            <label key={s.id} className="trk-multiselect-item">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={() => onToggle(s.id)} />
              <span className="trk-multiselect-dot" style={{ background: s.color }} />
              {t(`status_${s.id}`)}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" className="trk-multiselect-clear" onClick={onClear}>{t("clear_selection")}</button>
          )}
        </div>
      )}
    </div>
  );
}
