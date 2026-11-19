import React, { useMemo, useState } from "react";
import { AnimatedNumber } from "../../components/AnimatedNumber.jsx";
import { Check, FolderPlus, PanelLeftClose, PanelLeftOpen, Pencil, Search, X } from "lucide-react";
import { useLang, allProjectsLabel, selectedCountLabel } from "../../i18n.jsx";
import { matchesQuery, projectColor } from "../../utils";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination.jsx";
import { ProgressBar } from "../../components/ProgressBar.jsx";

const PROJECT_PAGE_SIZE = 6;

// Barre latérale des projets : filtre multi-projets, recherche à la demande,
// mode rail compact repliable, ajout / renommage / suppression.
export const ProjectSidebar = React.memo(function ProjectSidebar({
  totalTasks, projectProgress, filterProjects,
  onToggleFilter, onClearFilters, onAdd, onRemove, onRename,
  collapsed = false, onToggleCollapse,
}) {
  const { t, lang } = useLang();
  const [projectSearch, setProjectSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
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

  const showSearch = projectProgress.length > 5 || searchOpen || Boolean(projectSearch);

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

  if (collapsed) {
    return (
      <aside className="trk-sidebar trk-sidebar-collapsed" aria-label={t("projects")}>
        {onToggleCollapse && (
          <button
            type="button"
            className="trk-icon-btn trk-sidebar-toggle"
            onClick={onToggleCollapse}
            title={t("sidebar_expand")}
            aria-label={t("sidebar_expand")}
          >
            <PanelLeftOpen size={15} />
          </button>
        )}
        <button
          type="button"
          className={"trk-rail-all-btn" + (filterProjects.length === 0 ? " active" : "")}
          onClick={onClearFilters}
          title={allProjectsLabel(lang, totalTasks)}
          aria-label={allProjectsLabel(lang, totalTasks)}
          aria-pressed={filterProjects.length === 0}
        >
          <AnimatedNumber value={totalTasks} />
        </button>
        <div className="trk-rail-dots">
          {projectProgress.map((p) => (
            <button
              key={p.name}
              type="button"
              className={"trk-rail-dot-btn" + (filterProjects.includes(p.name) ? " active" : "")}
              style={{ "--project-color": projectColor(p.name) }}
              onClick={() => onToggleFilter(p.name)}
              title={`${p.name} (${p.count})`}
              aria-label={`${p.name} (${p.count})`}
              aria-pressed={filterProjects.includes(p.name)}
            >
              <span className="trk-project-dot" style={{ background: projectColor(p.name) }} />
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="trk-sidebar">
      <div className="trk-sidebar-title">
        <span className="trk-sidebar-heading">
          {t("projects")}
          {filterProjects.length > 0 && <span className="trk-filter-count"> · <AnimatedNumber value={selectedCountLabel(lang, filterProjects.length)} /></span>}
        </span>
        <span className="trk-sidebar-head-actions">
          {projectProgress.length <= 5 && (
            <button
              type="button"
              className={"trk-icon-btn" + (showSearch ? " active" : "")}
              onClick={() => setSearchOpen((v) => !v)}
              title={t("col_search_placeholder")}
              aria-label={t("col_search_placeholder")}
              aria-expanded={showSearch}
            >
              <Search size={12} />
            </button>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              className="trk-icon-btn trk-sidebar-toggle"
              onClick={onToggleCollapse}
              title={t("sidebar_collapse")}
              aria-label={t("sidebar_collapse")}
            >
              <PanelLeftClose size={13} />
            </button>
          )}
        </span>
      </div>
      <button
        className={"trk-all-btn" + (filterProjects.length === 0 ? " active" : "")}
        onClick={onClearFilters}
      >
        <AnimatedNumber value={allProjectsLabel(lang, totalTasks)} />
      </button>
      {showSearch && (
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
      )}
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
                    <span className="trk-project-count"><AnimatedNumber value={p.count} /></span>
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
});
