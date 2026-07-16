import React, { useMemo, useState } from "react";
import { Check, FolderPlus, Pencil, Search, X } from "lucide-react";
import { useLang, allProjectsLabel, selectedCountLabel } from "../../i18n.jsx";
import { matchesQuery, projectColor } from "../../utils";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination.jsx";
import { ProgressBar } from "../../components/ProgressBar.jsx";
import { HelpTip } from "../../tips.jsx";

const PROJECT_PAGE_SIZE = 6;

// Barre latérale des projets : filtre multi-projets, recherche, pagination,
// ajout / renommage / suppression (uniquement si le projet est vide).
export function ProjectSidebar({
  totalTasks, projectProgress, filterProjects,
  onToggleFilter, onClearFilters, onAdd, onRemove, onRename,
}) {
  const { t, lang } = useLang();
  const [projectSearch, setProjectSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const visibleProjects = useMemo(
    () => projectProgress.filter((p) => matchesQuery(p.name, projectSearch)),
    [projectProgress, projectSearch]
  );
  const { page, setPage, totalPages, pageItems } = usePagination(
    visibleProjects, PROJECT_PAGE_SIZE, projectSearch
  );

  const submitAdd = () => {
    onAdd(newName);
    setNewName("");
    setAdding(false);
  };

  const startRename = (name) => {
    setRenaming(name);
    setRenameValue(name);
  };

  const cancelRename = () => {
    setRenaming(null);
    setRenameValue("");
  };

  const confirmRename = () => {
    const oldName = renaming;
    const newValue = renameValue;
    cancelRename();
    if (oldName) onRename(oldName, newValue);
  };

  return (
    <aside className="trk-sidebar">
      <div className="trk-sidebar-title">
        {t("projects")}
        {filterProjects.length > 0 && <span className="trk-filter-count"> · {selectedCountLabel(lang, filterProjects.length)}</span>}
        <HelpTip tipKey="projects" />
      </div>
      <button
        className={"trk-all-btn" + (filterProjects.length === 0 ? " active" : "")}
        onClick={onClearFilters}
      >
        {allProjectsLabel(lang, totalTasks)}
      </button>
      <div className="trk-kanban-col-search trk-project-search">
        <Search size={11} color="var(--text-dim)" />
        <input
          value={projectSearch}
          onChange={(e) => setProjectSearch(e.target.value)}
          placeholder={t("col_search_placeholder")}
        />
        {projectSearch && (
          <button type="button" className="trk-icon-btn" onClick={() => setProjectSearch("")} title={t("clear_selection")}>
            <X size={11} />
          </button>
        )}
      </div>
      <div className="trk-project-list">
        {pageItems.map((p) => (
          <div
            key={p.name}
            className={"trk-project-card" + (filterProjects.includes(p.name) ? " active" : "")}
            style={{ "--project-color": projectColor(p.name) }}
            onClick={() => renaming !== p.name && onToggleFilter(p.name)}
            title={t("toggle_project_filter")}
          >
            {renaming === p.name ? (
              <div className="trk-add-project-row" onClick={(e) => e.stopPropagation()}>
                <input
                  className="trk-add-project-input"
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                    if (e.key === "Escape") cancelRename();
                  }}
                />
                <button className="trk-icon-btn" onClick={confirmRename} title={t("save")} aria-label={t("save")}><Check size={15} /></button>
                <button className="trk-icon-btn" onClick={cancelRename} title={t("cancel")} aria-label={t("cancel")}><X size={15} /></button>
              </div>
            ) : (
              <>
                <div className="trk-project-card-top">
                  <span className="trk-project-name">
                    <span className="trk-project-dot" style={{ background: projectColor(p.name) }} />
                    {p.name}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span className="trk-project-count">{p.count}</span>
                    <button
                      className="trk-project-remove"
                      onClick={(e) => { e.stopPropagation(); startRename(p.name); }}
                      title={t("rename_project")}
                    >
                      <Pencil size={12} />
                    </button>
                    {p.count === 0 && (
                      <button
                        className="trk-project-remove"
                        onClick={(e) => { e.stopPropagation(); onRemove(p.name); }}
                        title={t("remove_project")}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </span>
                </div>
                <ProgressBar value={p.progress} />
              </>
            )}
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="trk-project-pager">
          <Pagination compact page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      {adding ? (
        <div className="trk-add-project-row">
          <input
            className="trk-add-project-input"
            autoFocus
            placeholder={t("project_name_placeholder")}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitAdd()}
          />
          <button className="trk-icon-btn" onClick={submitAdd} title={t("add")} aria-label={t("add")}><Check size={15} /></button>
          <button className="trk-icon-btn" onClick={() => setAdding(false)} title={t("cancel")} aria-label={t("cancel")}><X size={15} /></button>
        </div>
      ) : (
        <button className="trk-ghost-btn" onClick={() => setAdding(true)}>
          <FolderPlus size={13} /> {t("new_project")}
        </button>
      )}
    </aside>
  );
}
