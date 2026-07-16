import React from "react";
import { ClipboardList, Plus } from "lucide-react";

// État vide illustré, avec action optionnelle (ex : créer une tâche).
export function EmptyState({ label, actionLabel, onAction }) {
  return (
    <div className="trk-empty trk-empty-rich">
      <ClipboardList size={30} strokeWidth={1.4} aria-hidden="true" />
      <p>{label}</p>
      {onAction && (
        <button type="button" className="trk-add-btn" onClick={onAction}>
          <Plus size={15} /> {actionLabel}
        </button>
      )}
    </div>
  );
}
