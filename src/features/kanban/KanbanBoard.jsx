import React, { useEffect, useRef, useState } from "react";
import { STATUSES } from "../../utils";
import { KanbanColumn } from "./KanbanColumn.jsx";

// Durée de l'animation d'atterrissage (sticky mode) : doit suivre
// @keyframes trk-sticky-land dans sticky.css.
const LANDING_MS = 550;

// Tableau kanban : une colonne par statut, drag & drop entre colonnes.
export function KanbanBoard({ tasks, statuses = STATUSES, onMove, ...cardProps }) {
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [justMovedId, setJustMovedId] = useState(null);
  const landingTimer = useRef(null);
  useEffect(() => () => clearTimeout(landingTimer.current), []);

  const endDrag = () => {
    setDragId(null);
    setOverCol(null);
  };

  const move = (id, statusId) => {
    onMove(id, statusId);
    clearTimeout(landingTimer.current);
    setJustMovedId(id);
    landingTimer.current = setTimeout(() => setJustMovedId(null), LANDING_MS);
  };

  const dragCtx = { dragId, setDragId, overCol, setOverCol, onMove: move, endDrag, justMovedId };

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
