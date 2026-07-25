import React, { useState } from "react";
import { STATUSES } from "../../utils";
import { KanbanColumn } from "./KanbanColumn.jsx";

// Tableau kanban : une colonne par statut, drag & drop entre colonnes.
export function KanbanBoard({ tasks, statuses = STATUSES, onMove, ...cardProps }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);

  const endDrag = () => {
    setDragId(null);
    setOverCol(null);
  };

  const dragCtx = { dragId, setDragId, overCol, setOverCol, onMove, endDrag };

  return (
    <div className="trk-kanban">
      {statuses.map((s) => (
        <KanbanColumn
          key={s.id}
          status={s}
          tasks={tasks.filter((tk) => tk.statut === s.id)}
          dragCtx={dragCtx}
          cardProps={cardProps}
        />
      ))}
    </div>
  );
}
