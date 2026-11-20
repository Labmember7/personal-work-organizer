import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUSES } from "../../utils";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { KanbanColumn } from "./KanbanColumn.jsx";

// Durée de l'animation d'atterrissage (sticky mode) : doit suivre
// @keyframes trk-sticky-land dans sticky.css.
const LANDING_MS = 550;
const STICKY_POS_STORAGE_KEY = "suivi-travaux-sticky-positions";

function readStickyPositions(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

// Tableau kanban : une colonne par statut, drag & drop entre colonnes.
export const KanbanBoard = React.memo(function KanbanBoard({
  tasks,
  statuses = STATUSES,
  stickyMode = false,
  onMove,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  confirmId,
  confirmAction,
  onAskDelete,
  onAskArchive,
  onAskUnarchive,
  onCancelConfirm,
}) {
  const [dragId, setDragId] = useState(null);
  const dragIdRef = useRef(null);
  dragIdRef.current = dragId;
  const grabOffsetRef = useRef({ x: 102, y: 42 });
  const [overCol, setOverCol] = useState(null);
  const [justMovedId, setJustMovedId] = useState(null);
  const landingTimer = useRef(null);
  useEffect(() => () => clearTimeout(landingTimer.current), []);

  const [stickyPositions, setStickyPositions] = useLocalStorageState(
    STICKY_POS_STORAGE_KEY,
    {},
    {
      read: readStickyPositions,
      write: (v) => JSON.stringify(v),
    }
  );
  const zCounterRef = useRef(1);
  useEffect(() => {
    let maxZ = 1;
    for (const pos of Object.values(stickyPositions || {})) {
      if (pos && typeof pos.z === "number" && pos.z > maxZ) maxZ = pos.z;
    }
    if (maxZ > zCounterRef.current) zCounterRef.current = maxZ;
  }, [stickyPositions]);

  const placeSticky = useCallback(
    (id, x, y) => {
      const nextZ = ++zCounterRef.current;
      setStickyPositions((prev) => ({
        ...prev,
        [id]: { x, y, z: nextZ },
      }));
      clearTimeout(landingTimer.current);
      setJustMovedId(id);
      landingTimer.current = setTimeout(() => setJustMovedId(null), LANDING_MS);
    },
    [setStickyPositions]
  );

  const handleCardDragStart = useCallback((id, grabOffset) => {
    setDragId(id);
    if (grabOffset) grabOffsetRef.current = grabOffset;
  }, []);

  const endDrag = useCallback(() => {
    setDragId(null);
    setOverCol(null);
  }, []);

  // Nettoie le surlignage .drag-over si un drag externe (ex. depuis la zone de
  // focus) survole une colonne puis est lâché hors du tableau.
  useEffect(() => {
    if (!overCol) return undefined;
    const clear = () => setOverCol(null);
    window.addEventListener("dragend", clear, { capture: true });
    window.addEventListener("drop", clear, { capture: true });
    return () => {
      window.removeEventListener("dragend", clear, { capture: true });
      window.removeEventListener("drop", clear, { capture: true });
    };
  }, [overCol]);

  const move = useCallback(
    (id, statusId, origin) => {
      if (origin) onMove(id, statusId, origin);
      else onMove(id, statusId);
      clearTimeout(landingTimer.current);
      setJustMovedId(id);
      landingTimer.current = setTimeout(() => setJustMovedId(null), LANDING_MS);
    },
    [onMove]
  );

  const baseCardProps = useMemo(() => ({
    onEdit,
    onDelete,
    onArchive,
    onUnarchive,
    onAskDelete,
    onAskArchive,
    onAskUnarchive,
    onCancelConfirm,
  }), [
    onEdit,
    onDelete,
    onArchive,
    onUnarchive,
    onAskDelete,
    onAskArchive,
    onAskUnarchive,
    onCancelConfirm,
  ]);

  const prevTasksByStatusRef = useRef({});
  const { tasksByStatus, statusByTaskId } = useMemo(() => {
    const freshMap = {};
    const idToStatus = new Map();
    for (const s of statuses) {
      freshMap[s.id] = [];
    }
    for (const tk of tasks) {
      if (freshMap[tk.statut]) {
        freshMap[tk.statut].push(tk);
        idToStatus.set(tk.id, tk.statut);
      }
    }
    const stableMap = {};
    const prev = prevTasksByStatusRef.current;
    for (const s of statuses) {
      const prevArr = prev[s.id];
      const freshArr = freshMap[s.id];
      if (
        prevArr &&
        prevArr.length === freshArr.length &&
        prevArr.every((tk, idx) => tk === freshArr[idx])
      ) {
        stableMap[s.id] = prevArr;
      } else {
        stableMap[s.id] = freshArr;
      }
    }
    prevTasksByStatusRef.current = stableMap;
    return { tasksByStatus: stableMap, statusByTaskId: idToStatus };
  }, [tasks, statuses]);

  const dragStatus = dragId ? statusByTaskId.get(dragId) : null;
  const movedStatus = justMovedId ? statusByTaskId.get(justMovedId) : null;
  const confirmStatus = confirmId ? statusByTaskId.get(confirmId) : null;

  return (
    <div className="trk-kanban">
      {statuses.map((s) => (
        <KanbanColumn
          key={s.id}
          status={s}
          tasks={tasksByStatus[s.id]}
          isOver={overCol === s.id}
          setOverCol={setOverCol}
          dragId={dragStatus === s.id ? dragId : null}
          dragIdRef={dragIdRef}
          grabOffsetRef={grabOffsetRef}
          setDragId={handleCardDragStart}
          onMove={move}
          endDrag={endDrag}
          stickyMode={stickyMode}
          stickyPositions={stickyPositions}
          onPlaceSticky={placeSticky}
          justMovedId={movedStatus === s.id ? justMovedId : null}
          confirmId={confirmStatus === s.id ? confirmId : null}
          confirmAction={confirmStatus === s.id ? confirmAction : null}
          cardProps={baseCardProps}
        />
      ))}
    </div>
  );
});
