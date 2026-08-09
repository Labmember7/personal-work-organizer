import React from "react";
import { Archive, Columns3, List, Plus, Puzzle, Search } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { HelpTip } from "../../tips.jsx";
import { StatusFilterDropdown } from "./StatusFilterDropdown.jsx";

// Barre d'outils de la zone principale : recherche, filtre de statuts, tri,
// bascule liste/kanban et création de tâche.
export function TaskToolbar({
  search, onSearchChange,
  filterStatuts, onToggleStatut, onClearStatuts,
  sortBy, onSortChange,
  viewMode, onViewChange,
  onNewTask,
}) {
  const { t } = useLang();
  return (
    <div className="trk-toolbar">
      <div className="trk-search">
        <Search size={14} color="var(--text-dim)" />
        <input
          placeholder={t("search_placeholder")}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <StatusFilterDropdown
        selected={filterStatuts}
        onToggle={onToggleStatut}
        onClear={onClearStatuts}
      />
      <select className="trk-select" value={sortBy} onChange={(e) => onSortChange(e.target.value)}>
        <option value="priorite">{t("sort_priority")}</option>
        <option value="statut">{t("sort_status")}</option>
        <option value="projet">{t("sort_project")}</option>
        <option value="echeance">{t("sort_due")}</option>
      </select>
      <div className="trk-view-switch">
        <button
          type="button"
          className={"trk-view-btn" + (viewMode === "list" ? " active" : "")}
          onClick={() => onViewChange("list")}
          title={t("view_list")}
          aria-pressed={viewMode === "list"}
        >
          <List size={14} /> <span className="trk-view-label">{t("view_list")}</span>
        </button>
        <button
          type="button"
          className={"trk-view-btn" + (viewMode === "kanban" ? " active" : "")}
          onClick={() => onViewChange("kanban")}
          title={t("view_kanban")}
          aria-pressed={viewMode === "kanban"}
        >
          <Columns3 size={14} /> <span className="trk-view-label">{t("view_kanban")}</span>
        </button>
        <button
          type="button"
          className={"trk-view-btn" + (viewMode === "archived" ? " active" : "")}
          onClick={() => onViewChange("archived")}
          title={t("view_archived")}
          aria-pressed={viewMode === "archived"}
        >
          <Archive size={14} /> <span className="trk-view-label">{t("view_archived")}</span>
        </button>
        <button
          type="button"
          className={"trk-view-btn" + (viewMode === "plugins" ? " active" : "")}
          onClick={() => onViewChange("plugins")}
          title={t("view_plugins")}
          aria-pressed={viewMode === "plugins"}
        >
          <Puzzle size={14} /> <span className="trk-view-label">{t("view_plugins")}</span>
        </button>
      </div>
      <button className="trk-add-btn" onClick={onNewTask}>
        <Plus size={15} /> {t("new_task")}
      </button>
      <HelpTip tipKey="tasks" />
    </div>
  );
}
