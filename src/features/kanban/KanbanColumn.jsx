import React, { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { PRIORITIES, taskMatchesQuery } from "../../utils";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination.jsx";
import { KanbanCard } from "./KanbanCard.jsx";

const KANBAN_PAGE_SIZE = 3;

// Colonne kanban : un statut, avec recherche et filtre priorité locaux,
// pagination, et dépôt par drag & drop.
export function KanbanColumn({ status, tasks, dragCtx, cardProps }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [prio, setPrio] = useState("");
  const { dragId, setDragId, overCol, setOverCol, onMove, endDrag, justMovedId } = dragCtx;

  const visible = useMemo(
    () => tasks.filter((tk) => (!prio || tk.priorite === prio) && taskMatchesQuery(tk, query)),
    [tasks, query, prio]
  );
  const { page, setPage, totalPages, pageItems } = usePagination(
    visible, KANBAN_PAGE_SIZE, `${query}|${prio}`
  );

  return (
    <div
      className={"trk-kanban-col" + (overCol === status.id ? " drag-over" : "")}
      style={{ "--col-color": status.color }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (overCol !== status.id) setOverCol(status.id);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOverCol(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || dragId;
        if (id) onMove(id, status.id);
        endDrag();
      }}
    >
      <div className="trk-kanban-col-header">
        <span className="trk-kanban-col-dot" style={{ background: status.color }} />
        <span className="trk-kanban-col-title">{t(`status_${status.id}`)}</span>
        <span className="trk-kanban-col-count">
          {visible.length === tasks.length ? tasks.length : `${visible.length}/${tasks.length}`}
        </span>
      </div>
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
        <select
          className={"trk-kanban-col-prio" + (prio ? " active" : "")}
          value={prio}
          onChange={(e) => setPrio(e.target.value)}
        >
          <option value="">{t("prio_all")}</option>
          {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{t(`prio_${p.id}`)}</option>)}
        </select>
      </div>
      <div className="trk-kanban-col-body">
        {pageItems.length === 0 && (
          <div className="trk-kanban-drop-hint">{t("kanban_empty_col")}</div>
        )}
        {pageItems.map((task) => (
          <KanbanCard
            key={task.id}
            task={task}
            dragging={dragId === task.id}
            justMoved={justMovedId === task.id}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/plain", task.id);
              e.dataTransfer.effectAllowed = "move";
              setDragId(task.id);
            }}
            onDragEnd={endDrag}
            {...cardProps}
          />
        ))}
      </div>
      <div className="trk-kanban-col-footer">
        <Pagination compact page={page} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
