import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { prioOf, statusOf, isDoneStatus, isTaskDone, taskMatchesQuery } from "./utils";
import { useLang } from "./i18n.jsx";
import { CelebrationOverlay, MiniCelebration, pickCelebration } from "./celebration.jsx";
import { Tutorial, TUTORIAL_STORAGE_KEY } from "./tips.jsx";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useUndoRedoShortcut } from "./hooks/useUndoRedoShortcut";
import { AppHeader } from "./components/AppHeader.jsx";
import { TitleBar } from "./components/TitleBar.jsx";
import { Toast } from "./components/Toast.jsx";
import { useTasks } from "./features/tasks/useTasks";
import { TaskList } from "./features/tasks/TaskList.jsx";
import { TaskModal } from "./features/tasks/TaskModal.jsx";
import { TaskToolbar } from "./features/tasks/TaskToolbar.jsx";
import { useProjects } from "./features/projects/useProjects";
import { ProjectSidebar } from "./features/projects/ProjectSidebar.jsx";
import { useFocusSession } from "./features/focus/useFocusSession";
import { FocusProvider } from "./features/focus/FocusContext.jsx";
import { FocusZone } from "./features/focus/FocusZone.jsx";
import { KanbanSection } from "./features/kanban/KanbanSection.jsx";
import { useChartData } from "./features/charts/useChartData";
import { ChartsSection } from "./features/charts/ChartsSection.jsx";
import { useBackup } from "./features/backup/useBackup";
import { ImportConfirmModal } from "./features/backup/ImportConfirmModal.jsx";

const THEME_STORAGE_KEY = "suivi-travaux-theme";
const CELEBRATIONS_STORAGE_KEY = "suivi-travaux-celebrations";

// Coquille de composition : état de vue (filtres, tri, modals, thème) et
// assemblage des features. La logique métier vit dans les hooks de features.
export default function App() {
  const { t } = useLang();
  const [maximized, setMaximized] = useState(false);

  // ── Filtres, tri et vue ──
  const [filterProjects, setFilterProjects] = useState([]);
  const [filterStatuts, setFilterStatuts] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("priorite");
  const [viewMode, setViewMode] = useState("list");
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState(null);

  // ── Thème et célébrations ──
  const [theme, setTheme] = useLocalStorageState(THEME_STORAGE_KEY, "dark");
  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const [celebration, setCelebration] = useState(null);
  const [miniCeleb, setMiniCeleb] = useState(null);
  const prevAllDone = useRef(null);
  const [celebrationsOn, setCelebrationsOn] = useLocalStorageState(CELEBRATIONS_STORAGE_KEY, true, {
    read: (raw) => raw !== "off",
    write: (v) => (v ? "on" : "off"),
  });

  const toggleCelebrations = () => {
    setCelebrationsOn((prev) => {
      if (prev) {
        // Coupe aussi tout effet en cours.
        setCelebration(null);
        setMiniCeleb(null);
      }
      return !prev;
    });
  };

  // Mini célébration quand une tâche passe à « terminé », sauf si tout est
  // terminé (la grande célébration prend le relais).
  const celebrateTaskDone = (statut, nextTasks) => {
    if (!celebrationsOn) return;
    if (!isDoneStatus(statut)) return;
    if (nextTasks.every(isTaskDone)) return;
    setMiniCeleb(Date.now());
  };

  // ── Données et features ──
  const store = useTasks({ onTaskDone: celebrateTaskDone });
  const { loading, tasks, projects, saveError } = store;

  useUndoRedoShortcut({ undo: store.undo, redo: store.redo });

  const { addProject, removeProject, renameProject } = useProjects(store);

  const focus = useFocusSession({
    loading, tasks, tasksRef: store.tasksRef,
    saveTasks: store.saveTasks, moveTask: store.moveTask, t,
  });

  const backup = useBackup({
    tasks, projects, saveBoth: store.saveBoth,
    onImported: () => {
      setFilterProjects([]);
      setFilterStatuts([]);
    },
    onToast: setToast, t,
  });

  const chartData = useChartData(tasks, projects);

  // ── Guide de démarrage : affiché à la première ouverture, rejouable via le « ? » ──
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    try {
      return !localStorage.getItem(TUTORIAL_STORAGE_KEY);
    } catch (e) {
      return false;
    }
  });

  const closeTutorial = () => {
    setTutorialOpen(false);
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
    } catch (e) {
      // stockage indisponible, le guide réapparaîtra à la prochaine ouverture
    }
  };

  // ── Effets d'UI ──
  useEffect(() => {
    if (!window.windowControls) return;
    window.windowControls.isMaximized().then(setMaximized);
    return window.windowControls.onMaximizedChanged(setMaximized);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const doneCount = tasks.filter(isTaskDone).length;
  const allDone = tasks.length > 0 && doneCount === tasks.length;

  // Célébration au passage à « tout terminé » (jamais au chargement initial).
  useEffect(() => {
    if (loading) return;
    if (prevAllDone.current === null) {
      prevAllDone.current = allDone;
      return;
    }
    if (allDone && !prevAllDone.current && celebrationsOn) setCelebration(pickCelebration());
    prevAllDone.current = allDone;
  }, [allDone, loading, celebrationsOn]);

  // La grande célébration remplace toute mini en attente : sans ça, une mini
  // masquée par la grande rejouerait toute seule une fois celle-ci terminée.
  useEffect(() => {
    if (celebration) setMiniCeleb(null);
  }, [celebration]);

  // ── Dérivés ──
  const filteredTasks = useMemo(() => {
    return tasks.filter(
      (tk) =>
        (!filterProjects.length || filterProjects.includes(tk.projet)) &&
        (!filterStatuts.length ||
          filterStatuts.includes(tk.statut) ||
          (filterStatuts.includes("termine") && isTaskDone(tk))) &&
        // Même logique que la recherche des colonnes kanban : titre,
        // description, projet et assigné, insensible aux accents.
        taskMatchesQuery(tk, search)
    );
  }, [tasks, filterProjects, filterStatuts, search]);

  const sortedTasks = useMemo(() => {
    const arr = [...filteredTasks];
    arr.sort((a, b) => {
      if (sortBy === "priorite") return prioOf(a.priorite).order - prioOf(b.priorite).order;
      if (sortBy === "statut") return statusOf(a.statut).weight - statusOf(b.statut).weight;
      if (sortBy === "projet") return a.projet.localeCompare(b.projet);
      if (sortBy === "echeance") return (a.echeance || "9999-99-99").localeCompare(b.echeance || "9999-99-99");
      return 0;
    });
    return arr;
  }, [filteredTasks, sortBy]);

  const listResetKey = `${filterProjects.join(",")}|${filterStatuts.join(",")}|${search}|${sortBy}`;

  const globalProgress = useMemo(() => {
    if (tasks.length === 0) return 0;
    const sum = tasks.reduce((acc, tk) => acc + statusOf(tk.statut).weight, 0);
    return Math.round(sum / tasks.length);
  }, [tasks]);

  // ── Actions ──
  const openNewTask = () => {
    setEditing({
      id: null,
      type: "standard",
      projet: (filterProjects.length === 1 ? filterProjects[0] : projects[0]) || "",
      titre: "",
      description: "",
      priorite: "moyenne",
      statut: "analyser",
      assigne: "",
      dateDebut: new Date().toISOString().slice(0, 10),
      echeance: "",
      timeLogs: [],
    });
  };

  const openEditTask = (task) => setEditing({ ...task });

  const handleDeleteTask = (id) => {
    store.deleteTask(id);
    setConfirmDelete(null);
  };

  const toggleFilterProject = (name) => {
    setFilterProjects((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  };

  const toggleFilterStatut = (id) => {
    setFilterStatuts((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleRemoveProject = (name) => {
    if (removeProject(name)) {
      setFilterProjects((prev) => prev.filter((p) => p !== name));
    }
  };

  const handleRenameProject = (oldName, newName) => {
    if (renameProject(oldName, newName)) {
      const trimmed = newName.trim();
      setFilterProjects((prev) => prev.map((p) => (p === oldName ? trimmed : p)));
    }
  };

  const timeLogOps = {
    addTimeLog: store.addTimeLog,
    editTimeLog: store.editTimeLog,
    deleteTimeLog: store.deleteTimeLog,
  };

  const deleteProps = {
    confirmId: confirmDelete,
    onAskDelete: setConfirmDelete,
    onCancelDelete: () => setConfirmDelete(null),
  };

  // ── Rendu ──
  return (
    <FocusProvider focusId={focus.focusId} focusStartedAt={focus.focusStartedAt}>
    <div className={"trk-app" + (maximized ? " trk-app-maximized" : "") + (theme === "light" ? " light" : "")}>
      <TitleBar maximized={maximized} />

      <div className="trk-content">
      {loading ? (
        <div className="trk-loading">{t("loading")}</div>
      ) : (
        <>
          <AppHeader
            globalProgress={globalProgress}
            doneCount={doneCount}
            totalTasks={tasks.length}
            onImport={backup.importData}
            onExport={backup.exportData}
            ioBusy={backup.ioBusy}
            onOpenTutorial={() => setTutorialOpen(true)}
            celebrationsOn={celebrationsOn}
            onToggleCelebrations={toggleCelebrations}
            theme={theme}
            onToggleTheme={toggleTheme}
            canUndo={store.canUndo}
            canRedo={store.canRedo}
            onUndo={store.undo}
            onRedo={store.redo}
          />

          <div className="trk-layout">
            <ProjectSidebar
              totalTasks={tasks.length}
              projectProgress={chartData.projectProgress}
              filterProjects={filterProjects}
              onToggleFilter={toggleFilterProject}
              onClearFilters={() => setFilterProjects([])}
              onAdd={addProject}
              onRemove={handleRemoveProject}
              onRename={handleRenameProject}
            />

            <main className="trk-main">
              <TaskToolbar
                search={search}
                onSearchChange={setSearch}
                filterStatuts={filterStatuts}
                onToggleStatut={toggleFilterStatut}
                onClearStatuts={() => setFilterStatuts([])}
                sortBy={sortBy}
                onSortChange={setSortBy}
                viewMode={viewMode}
                onViewChange={setViewMode}
                onNewTask={openNewTask}
              />

              {viewMode === "kanban" ? (
                <KanbanSection
                  tasks={sortedTasks}
                  onNewTask={openNewTask}
                  boardProps={{
                    onMove: store.moveTask,
                    onEdit: openEditTask,
                    onDelete: handleDeleteTask,
                    ...deleteProps,
                  }}
                />
              ) : (
                <TaskList
                  tasks={sortedTasks}
                  resetKey={listResetKey}
                  onNewTask={openNewTask}
                  rowProps={{
                    onEdit: openEditTask,
                    onDelete: handleDeleteTask,
                    ...deleteProps,
                    timeLogOps,
                  }}
                />
              )}
            </main>
          </div>

          <ChartsSection tasks={tasks} projects={projects} chartData={chartData} />

          <FocusZone
            task={focus.focusTask}
            leaving={focus.focusLeaving}
            enterKey={focus.focusEnterKey}
            startedAt={focus.focusStartedAt}
            onDropTask={focus.focusOnTask}
            onAdvance={focus.advanceFocusTask}
            onRelease={focus.releaseFocus}
            onEdit={openEditTask}
          />

          <Tutorial open={tutorialOpen} onClose={closeTutorial} />

          {saveError && (
            <div className="trk-save-error">
              <AlertTriangle size={13} /> {t("save_error")}
            </div>
          )}

          <ImportConfirmModal
            pendingImport={backup.pendingImport}
            onConfirm={backup.confirmImport}
            onCancel={backup.cancelImport}
          />

          {celebration && celebrationsOn && (
            <CelebrationOverlay
              variant={celebration.variant}
              legendary={celebration.legendary}
              title={t(celebration.legendary ? "celebrate_legendary_title" : `celebrate_title_${celebration.msg}`)}
              subtitle={t(celebration.legendary ? "celebrate_legendary_sub" : `celebrate_sub_${celebration.msg}`)}
              onDone={() => setCelebration(null)}
            />
          )}

          {miniCeleb && !celebration && celebrationsOn && (
            <MiniCelebration key={miniCeleb} onDone={() => setMiniCeleb(null)} />
          )}

          <Toast toast={toast} />

          {editing && (
            <TaskModal
              initial={editing}
              storeTask={editing.id ? tasks.find((tk) => tk.id === editing.id) : null}
              projects={projects}
              onSubmit={store.upsertTask}
              onClose={() => setEditing(null)}
              timeLogOps={timeLogOps}
              onToast={setToast}
            />
          )}
        </>
      )}
      </div>
    </div>
    </FocusProvider>
  );
}
