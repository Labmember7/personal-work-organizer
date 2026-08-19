import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  prioOf, statusOf, isDoneStatus, isTaskDone, taskMatchesQuery, randomThemeVars, randomThemePattern,
} from "./utils";
import { useLang } from "./i18n.jsx";
import { CelebrationOverlay, MiniCelebration, pickCelebration } from "./celebration.jsx";
import { Tutorial, TUTORIAL_STORAGE_KEY } from "./tips.jsx";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useUndoRedoShortcut } from "./hooks/useUndoRedoShortcut";
import { AppHeader } from "./components/AppHeader.jsx";
import { TitleBar } from "./components/TitleBar.jsx";
import { Toast } from "./components/Toast.jsx";
import { DebugConsole } from "./components/DebugConsole.jsx";
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
import { PluginsSection } from "./features/plugins/PluginsSection.jsx";
import { discoverPlugins } from "./services/plugins";
import { collectTaskColumns, collectTaskPanels } from "./lib/plugins/contrib";

const THEME_STORAGE_KEY = "suivi-travaux-theme";
const RANDOM_SEED_STORAGE_KEY = "suivi-travaux-random-seed";
const STICKY_STORAGE_KEY = "suivi-travaux-sticky-mode";
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
  const [confirm, setConfirm] = useState(null); // { id, action: "delete" | "archive" | "unarchive" }
  const [toast, setToast] = useState(null);

  // ── Colonnes de tâches contribuées par les plugins (v2) ──
  // Découverte une fois au montage ; les colonnes s'affichent dans chaque
  // ligne de la vue liste (cf. TaskRow). Découplé de PluginsSection pour
  // rester disponible quelle que soit la vue active.
  const [taskColumns, setTaskColumns] = useState([]);
  const [taskPanels, setTaskPanels] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { plugins } = await discoverPlugins();
      if (cancelled) return;
      setTaskColumns(collectTaskColumns(plugins));
      setTaskPanels(collectTaskPanels(plugins));
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Thème et célébrations ──
  // theme = palette de couleurs (dark / light / random) ; le mode sticky
  // (post-it) se superpose à n'importe laquelle des trois, indépendamment.
  const [theme, setTheme] = useLocalStorageState(THEME_STORAGE_KEY, "dark");
  // Persisté : le tirage du thème random ne change qu'en re-basculant dessus,
  // pas à chaque relance de l'appli (cf. retour utilisateur).
  const [randomSeed, setRandomSeed] = useLocalStorageState(RANDOM_SEED_STORAGE_KEY, 0, {
    read: (raw) => (raw !== null ? parseFloat(raw) : Math.random()),
    write: (v) => String(v),
  });
  const toggleTheme = () =>
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : prev === "light" ? "random" : "dark";
      if (next === "random") setRandomSeed(Math.random());
      return next;
    });
  const [stickyMode, setStickyMode] = useLocalStorageState(STICKY_STORAGE_KEY, false, {
    read: (raw) => raw === "1",
    write: (v) => (v ? "1" : "0"),
  });
  const toggleStickyMode = () => setStickyMode((v) => !v);

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

  // Les tâches archivées sont exclues du tableau de bord (progression,
  // graphiques, célébrations) : elles ne représentent plus du travail actif.
  const activeTasks = tasks.filter((tk) => !tk.archived);

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

  const chartData = useChartData(activeTasks, projects);

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

  const doneCount = activeTasks.filter(isTaskDone).length;
  const allDone = activeTasks.length > 0 && doneCount === activeTasks.length;

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
  const sortTasks = (list) => {
    const arr = [...list];
    arr.sort((a, b) => {
      if (sortBy === "priorite") return prioOf(a.priorite).order - prioOf(b.priorite).order;
      if (sortBy === "statut") return statusOf(a.statut).weight - statusOf(b.statut).weight;
      if (sortBy === "projet") return a.projet.localeCompare(b.projet);
      if (sortBy === "echeance") return (a.echeance || "9999-99-99").localeCompare(b.echeance || "9999-99-99");
      return 0;
    });
    return arr;
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(
      (tk) =>
        !tk.archived &&
        (!filterProjects.length || filterProjects.includes(tk.projet)) &&
        (!filterStatuts.length ||
          filterStatuts.includes(tk.statut) ||
          (filterStatuts.includes("termine") && isTaskDone(tk))) &&
        // Même logique que la recherche des colonnes kanban : titre,
        // description, projet et assigné, insensible aux accents.
        taskMatchesQuery(tk, search)
    );
  }, [tasks, filterProjects, filterStatuts, search]);

  const sortedTasks = useMemo(() => sortTasks(filteredTasks), [filteredTasks, sortBy]);

  // Vue « Archives » : mêmes recherche/tri, mais parmi les tâches archivées
  // uniquement (les filtres projet/statut ne s'y appliquent pas).
  const archivedTasks = useMemo(
    () => tasks.filter((tk) => tk.archived && taskMatchesQuery(tk, search)),
    [tasks, search]
  );
  const sortedArchivedTasks = useMemo(() => sortTasks(archivedTasks), [archivedTasks, sortBy]);

  const listResetKey = `${filterProjects.join(",")}|${filterStatuts.join(",")}|${search}|${sortBy}|${viewMode}`;

  const globalProgress = useMemo(() => {
    if (activeTasks.length === 0) return 0;
    const sum = activeTasks.reduce((acc, tk) => acc + statusOf(tk.statut).weight, 0);
    return Math.round(sum / activeTasks.length);
  }, [activeTasks]);

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

  // Un nœud de plugin peut pointer une tâche qui n'existe plus (supprimée
  // depuis) : on le signale plutôt que de silencieusement ne rien faire.
  const handleRevealTask = (id) => {
    const task = tasks.find((tk) => tk.id === id);
    if (task) openEditTask(task);
    else setToast({ type: "error", text: t("plugin_task_not_found") });
  };

  const handlePluginToast = (message) => setToast({ type: "success", text: message });

  const handleDeleteTask = (id) => {
    store.deleteTask(id);
    setConfirm(null);
  };

  const handleArchiveTask = (id) => {
    store.archiveTask(id);
    setConfirm(null);
  };

  const handleUnarchiveTask = (id) => {
    store.unarchiveTask(id);
    setConfirm(null);
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

  const confirmProps = {
    confirmId: confirm?.id ?? null,
    confirmAction: confirm?.action ?? null,
    onAskDelete: (id) => setConfirm({ id, action: "delete" }),
    onAskArchive: (id) => setConfirm({ id, action: "archive" }),
    onAskUnarchive: (id) => setConfirm({ id, action: "unarchive" }),
    onCancelConfirm: () => setConfirm(null),
  };

  // ── Rendu ──
  return (
    <FocusProvider focusId={focus.focusId} focusStartedAt={focus.focusStartedAt}>
    <div
      className={
        "trk-app" +
        (maximized ? " trk-app-maximized" : "") +
        (theme === "light" ? " light" : "") +
        (theme === "random" ? " random" : "") +
        (stickyMode ? " sticky" : "")
      }
      style={theme === "random" ? randomThemeVars(randomSeed) : undefined}
      data-pattern={theme === "random" ? randomThemePattern(randomSeed) : undefined}
    >
      <TitleBar maximized={maximized} />
      <DebugConsole />

      <div className="trk-content">
      {loading ? (
        <div className="trk-loading">{t("loading")}</div>
      ) : (
        <>
          <AppHeader
            globalProgress={globalProgress}
            doneCount={doneCount}
            totalTasks={activeTasks.length}
            onImport={backup.importData}
            onExport={backup.exportData}
            ioBusy={backup.ioBusy}
            onOpenTutorial={() => setTutorialOpen(true)}
            celebrationsOn={celebrationsOn}
            onToggleCelebrations={toggleCelebrations}
            theme={theme}
            onToggleTheme={toggleTheme}
            stickyMode={stickyMode}
            onToggleStickyMode={toggleStickyMode}
            canUndo={store.canUndo}
            canRedo={store.canRedo}
            onUndo={store.undo}
            onRedo={store.redo}
          />

          <div className="trk-layout">
            <ProjectSidebar
              totalTasks={activeTasks.length}
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
                    onArchive: handleArchiveTask,
                    onUnarchive: handleUnarchiveTask,
                    ...confirmProps,
                  }}
                />
              ) : viewMode === "plugins" ? (
                <PluginsSection
                  tasks={tasks}
                  projects={projects}
                  theme={theme}
                  randomSeed={randomSeed}
                  onRevealTask={handleRevealTask}
                  onToast={handlePluginToast}
                />
              ) : viewMode === "archived" ? (
                <TaskList
                  tasks={sortedArchivedTasks}
                  resetKey={listResetKey}
                  onNewTask={undefined}
                  emptyLabel={t("empty_archived_list")}
                  rowProps={{
                    onEdit: openEditTask,
                    onDelete: handleDeleteTask,
                    onArchive: handleArchiveTask,
                    onUnarchive: handleUnarchiveTask,
                    ...confirmProps,
                    timeLogOps,
                    taskColumns,
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
                    onArchive: handleArchiveTask,
                    onUnarchive: handleUnarchiveTask,
                    ...confirmProps,
                    timeLogOps,
                    taskColumns,
                  }}
                />
              )}
            </main>
          </div>

          <ChartsSection tasks={activeTasks} projects={projects} chartData={chartData} onEditTask={openEditTask} />

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
              taskPanels={taskPanels}
            />
          )}
        </>
      )}
      </div>
    </div>
    </FocusProvider>
  );
}
