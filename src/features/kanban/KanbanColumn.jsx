import React, { useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "../../components/AnimatedNumber.jsx";
import { Select } from "../../components/Select.jsx";
import { Search, X } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { PRIORITIES, compileSearchTerms, taskMatchesTerms } from "../../utils";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination.jsx";
import { KanbanCard } from "./KanbanCard.jsx";

const KANBAN_PAGE_SIZE = 4;
const STICKY_NOTE_W = 204;
const STICKY_NOTE_H = 118;
const STICKY_PAD = 12;
const STICKY_DEFAULT_X = [0.06, 0.56, 0.28, 0.72];

// Colonne kanban : un statut, avec recherche et filtre priorité à la demande,
// pagination et dépôt par drag & drop.
export const KanbanColumn = React.memo(function KanbanColumn({
  status,
  tasks,
  isOver,
  setOverCol,
  dragId,
  dragIdRef,
  grabOffsetRef,
  setDragId,
  onMove,
  endDrag,
  stickyMode = false,
  stickyPositions,
  onPlaceSticky,
  justMovedId,
  confirmId,
  confirmAction,
  cardProps,
}) {
  const { t } = useLang();
  const bodyRef = useRef(null);
  const [query, setQuery] = useState("");
  const [prio, setPrio] = useState("");
  const [toolsOpen, setToolsOpen] = useState(false);

  const hasActiveFilter = Boolean(query) || Boolean(prio);
  const showTools = toolsOpen || hasActiveFilter;

  const visible = useMemo(() => {
    const terms = compileSearchTerms(query);
    if (!prio && terms.length === 0) return tasks;
    return tasks.filter((tk) => (!prio || tk.priorite === prio) && taskMatchesTerms(tk, terms));
  }, [tasks, query, prio]);
  const { page, setPage, totalPages, pageItems } = usePagination(
    visible, KANBAN_PAGE_SIZE, `${query}|${prio}`
  );

  // En mode sticky, calcule une hauteur minimale de toile pour que les post-it
  // posés en absolu restent tous accessibles au scroll sans jamais être rognés.
  const stickyCanvasMinHeight = useMemo(() => {
    if (!stickyMode || pageItems.length === 0) return undefined;
    let maxBottom = 0;
    pageItems.forEach((tk, idx) => {
      const saved = stickyPositions?.[tk.id];
      const y = saved && typeof saved.y === "number" ? saved.y : 14 + idx * 130;
      if (y + STICKY_NOTE_H + STICKY_PAD > maxBottom) {
        maxBottom = y + STICKY_NOTE_H + STICKY_PAD;
      }
    });
    return maxBottom;
  }, [stickyMode, pageItems, stickyPositions]);

  return (
    <div
      className={"trk-kanban-col" + (isOver ? " drag-over" : "")}
      style={{ "--col-color": status.color }}
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
        if (!isOver) setOverCol(status.id);
      }}
      onDragLeave={(e) => {
        if (isOver && !(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
          setOverCol(null);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer?.getData("text/plain") || dragId || dragIdRef?.current;
        const hasCoords = typeof e.clientX === "number" && typeof e.clientY === "number" && !isNaN(e.clientX) && !isNaN(e.clientY) && (e.clientX > 0 || e.clientY > 0);
        const origin = hasCoords ? { x: e.clientX, y: e.clientY } : undefined;
        if (id) {
          if (stickyMode && onPlaceSticky && hasCoords && bodyRef.current) {
            const rect = bodyRef.current.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const noteW = Math.min(STICKY_NOTE_W, Math.max(120, rect.width - STICKY_PAD * 2));
              const availW = Math.max(0, rect.width - noteW - STICKY_PAD * 2);
              const grab = grabOffsetRef?.current || { x: noteW / 2, y: 40 };
              const rawLeft = e.clientX - rect.left - grab.x;
              const xRatio = availW > 0 ? Math.max(0, Math.min(1, (rawLeft - STICKY_PAD) / availW)) : 0;
              const rawTop = e.clientY - rect.top + bodyRef.current.scrollTop - grab.y;
              const maxY = Math.max(
                STICKY_PAD,
                Math.max(rect.height, bodyRef.current.scrollHeight) - STICKY_NOTE_H - STICKY_PAD
              );
              const yPx = Math.round(Math.max(STICKY_PAD, Math.min(rawTop, maxY)));
              onPlaceSticky(id, Number(xRatio.toFixed(4)), yPx);
            }
          }
          if (origin) onMove(id, status.id, origin);
          else onMove(id, status.id);
        }
        endDrag();
      }}
    >
      <div className="trk-kanban-col-header">
        <span className="trk-kanban-col-dot" style={{ background: status.color }} />
        <span className="trk-kanban-col-title">{t(`status_${status.id}`)}</span>
        <button
          type="button"
          className={"trk-icon-btn trk-col-filter-btn" + (showTools ? " active" : "")}
          onClick={() => setToolsOpen((o) => !o)}
          title={t("col_filter_toggle")}
          aria-label={t("col_filter_toggle")}
          aria-expanded={showTools}
        >
          <Search size={12} />
        </button>
        <span className="trk-kanban-col-count">
          <AnimatedNumber value={visible.length === tasks.length ? tasks.length : `${visible.length}/${tasks.length}`} />
        </span>
      </div>
      {showTools && (
        <div className="trk-kanban-col-tools">
          <div className="trk-kanban-col-search">
            <Search size={11} color="var(--text-dim)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("col_search_placeholder")}
            />
            {query && (
              <button type="button" className="trk-icon-btn" onClick={() => setQuery("")} title={t("clear_selection")}>
                <X size={11} />
              </button>
            )}
          </div>
          <Select
            className={"trk-kanban-col-prio" + (prio ? " active" : "")}
            value={prio}
            onChange={(e) => setPrio(e.target.value)}
          >
            <option value="">{t("prio_all")}</option>
            {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{t(`prio_${p.id}`)}</option>)}
          </Select>
        </div>
      )}
      <div
        ref={bodyRef}
        className={"trk-kanban-col-body" + (stickyMode ? " is-sticky-canvas" : "")}
      >
        {pageItems.length === 0 && (
          <div className="trk-kanban-drop-hint">{t("kanban_empty_col")}</div>
        )}
        {stickyMode && stickyCanvasMinHeight ? (
          <div className="trk-sticky-stage" style={{ minHeight: `${stickyCanvasMinHeight}px` }}>
            {pageItems.map((task, idx) => {
              const saved = stickyPositions?.[task.id];
              const stickyPos = saved
                ? saved
                : {
                    x: STICKY_DEFAULT_X[idx % STICKY_DEFAULT_X.length],
                    y: 14 + idx * 130,
                    z: idx + 1,
                  };
              return (
                <KanbanCard
                  key={task.id}
                  task={task}
                  dragging={dragId === task.id}
                  justMoved={justMovedId === task.id}
                  stickyPos={stickyPos}
                  onDragStart={setDragId}
                  onDragEnd={endDrag}
                  confirmId={confirmId === task.id ? confirmId : null}
                  confirmAction={confirmId === task.id ? confirmAction : null}
                  {...cardProps}
                />
              );
            })}
          </div>
        ) : (
          pageItems.map((task) => (
            <KanbanCard
              key={task.id}
              task={task}
              dragging={dragId === task.id}
              justMoved={justMovedId === task.id}
              onDragStart={setDragId}
              onDragEnd={endDrag}
              confirmId={confirmId === task.id ? confirmId : null}
              confirmAction={confirmId === task.id ? confirmAction : null}
              {...cardProps}
            />
          ))
        )}
      </div>
      {totalPages > 1 && (
        <div className="trk-kanban-col-footer">
          <Pagination compact page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
});
