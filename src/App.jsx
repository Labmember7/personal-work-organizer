import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  prioOf, statusOf, isDoneStatus, isTaskDone, compileSearchTerms, taskMatchesTerms,
  randomThemeVars, randomThemePattern,
} from "./utils";
import { getNextTheme, isLightTheme, isValidTheme } from "./lib/themes";
import { useLang } from "./i18n.jsx";
import { playTaskDoneSound } from "./lib/audioFx";
import { useLocalStorageState } from "./hooks/useLocalStorageState";
import { useUndoRedoShortcut } from "./hooks/useUndoRedoShortcut";
import { AppHeader } from "./components/AppHeader.jsx";
import { TitleBar } from "./components/TitleBar.jsx";
import { Toast } from "./components/Toast.jsx";
import { DynamicIsland } from "./components/DynamicIsland/DynamicIsland.jsx";
import { DesktopPetSync } from "./features/desktopPet/DesktopPetSync.jsx";
import { usePomodoroSession } from "./hooks/usePomodoroSession";
import { getOrCreatePetDna } from "./lib/petGenerator";
import { useTasks } from "./features/tasks/useTasks";
import { TaskList } from "./features/tasks/TaskList.jsx";
import { TaskToolbar } from "./features/tasks/TaskToolbar.jsx";
import { useProjects } from "./features/projects/useProjects";
import { ProjectSidebar } from "./features/projects/ProjectSidebar.jsx";
import { useFocusSession } from "./features/focus/useFocusSession";
import { FocusProvider } from "./features/focus/FocusContext.jsx";
import { FocusZone } from "./features/focus/FocusZone.jsx";
import { KanbanSection } from "./features/kanban/KanbanSection.jsx";
import { computeProjectProgress } from "./features/charts/useChartData";
import { useBackup } from "./features/backup/useBackup";
import { discoverPlugins } from "./services/plugins";
import { collectTaskColumns, collectTaskPanels } from "./lib/plugins/contrib";

// Chargement dynamique des modules lourds (éditeur riche, graphiques Recharts,
// plugins + icônes complètes, tutoriel illustré, célébrations, modales).
const TaskModal = lazy(() =>
  import("./features/tasks/TaskModal.jsx").then((m) => ({ default: m.TaskModal }))
);
const ChartsSection = lazy(() =>
  import("./features/charts/ChartsSection.jsx").then((m) => ({ default: m.ChartsSection }))
);
const PluginsSection = lazy(() =>
  import("./features/plugins/PluginsSection.jsx").then((m) => ({ default: m.PluginsSection }))
);
const Tutorial = lazy(() =>
  import("./tips.jsx").then((m) => ({ default: m.Tutorial }))
);
const ImportConfirmModal = lazy(() =>
  import("./features/backup/ImportConfirmModal.jsx").then((m) => ({
    default: m.ImportConfirmModal,
  }))
);
const CelebrationOverlay = lazy(() =>
  import("./celebration.jsx").then((m) => ({ default: m.CelebrationOverlay }))
);
const MiniCelebration = lazy(() =>
  import("./celebration.jsx").then((m) => ({ default: m.MiniCelebration }))
);

const THEME_STORAGE_KEY = "suivi-travaux-theme";
const RANDOM_SEED_STORAGE_KEY = "suivi-travaux-random-seed";
const STICKY_STORAGE_KEY = "suivi-travaux-sticky-mode";
const CELEBRATIONS_STORAGE_KEY = "suivi-travaux-celebrations";
const TUTORIAL_STORAGE_KEY = "suivi-travaux-tutorial-seen";

const CELEBRATION_VARIANTS = ["confetti", "fireworks", "ribbons", "stardust", "petals"];
function pickCelebrationVariant() {
  const legendary = Math.random() < 1 / 1000;
  const variant = legendary
    ? "legendary"
    : CELEBRATION_VARIANTS[Math.floor(Math.random() * CELEBRATION_VARIANTS.length)];
  return { variant, legendary, msg: 1 + Math.floor(Math.random() * 4) };
}

// Coquille de composition : état de vue (filtres, tri, modals, thème) et
// assemblage des features. La logique métier vit dans les hooks de features.
export default function App() {
  const { t } = useLang();
  const [maximized, setMaximized] = useState(false);
  const [windowHidden, setWindowHidden] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden"
  );

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVis = () => setWindowHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ── Compagnon unique partagé (Dynamic Island + pet flottant du bureau) ──
  const [petDna, setPetDna] = useState(() => getOrCreatePetDna());
  const [petMood, setPetMood] = useState("normal");
  const [petEnergy, setPetEnergy] = useState(96);
  const [desktopPetEnabled, setDesktopPetEnabled] = useLocalStorageState(
    "suivi-travaux-desktop-pet-enabled",
    true,
    {
      read: (raw) => raw !== "0",
      write: (v) => (v ? "1" : "0"),
    }
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState(
    "suivi-travaux-sidebar-collapsed",
    false,
    {
      read: (raw) => raw === "1",
      write: (v) => (v ? "1" : "0"),
    }
  );

  // ── Chronomètre Pomodoro unifié (décompte isolé sans re-render de App) ──
  const pomodoro = usePomodoroSession({ onMoodChange: setPetMood, trackTimeInState: false });

  const petState = useMemo(() => ({
    petDna,
    setPetDna,
    petMood,
    setPetMood,
    petEnergy,
    setPetEnergy,
  }), [petDna, petMood, petEnergy]);

  // ── Filtres, tri et vue ──
  const [filterProjects, setFilterProjects] = useState([]);
  const [filterStatuts, setFilterStatuts] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("priorite");
  const [viewMode, setViewMode] = useState("kanban");
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null); // { id, action: "delete" | "archive" | "unarchive" }
  const [toast, setToast] = useState(null);

  // ── Colonnes de tâches contribuées par les plugins (v2) ──
  const [taskColumns, setTaskColumns] = useState([]);
  const [taskPanels, setTaskPanels] = useState([]);
  useEffect(() => {
    const onInvalid = (e) => e.preventDefault();
    document.addEventListener("invalid", onInvalid, true);
    return () => document.removeEventListener("invalid", onInvalid, true);
  }, []);
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

  // ── Thèmes (6 thèmes dédiés + aléatoire) et célébrations ──
  const [theme, setTheme] = useLocalStorageState(THEME_STORAGE_KEY, "dark", {
    read: (raw) => (isValidTheme(raw) ? raw : "dark"),
    write: (v) => String(v),
  });
  const [randomSeed, setRandomSeed] = useLocalStorageState(RANDOM_SEED_STORAGE_KEY, 0, {
    read: (raw) => (raw !== null ? parseFloat(raw) : Math.random()),
    write: (v) => String(v),
  });

  const selectTheme = useCallback((nextTheme) => {
    if (!isValidTheme(nextTheme)) return;
    if (nextTheme === "random") setRandomSeed(Math.random());
    setTheme(nextTheme);
  }, [setRandomSeed, setTheme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = getNextTheme(prev);
      if (next === "random") setRandomSeed(Math.random());
      return next;
    });
  }, [setRandomSeed, setTheme]);

  const [stickyMode, setStickyMode] = useLocalStorageState(STICKY_STORAGE_KEY, false, {
    read: (raw) => raw === "1",
    write: (v) => (v ? "1" : "0"),
  });
  const toggleStickyMode = useCallback(() => setStickyMode((v) => !v), [setStickyMode]);

  // Charge la police manuscrite Patrick Hand uniquement lorsque le mode sticky est activé.
  useEffect(() => {
    if (!stickyMode) return;
    void import("@fontsource/patrick-hand/latin-400.css");
    void import("@fontsource/patrick-hand/latin-ext-400.css");
  }, [stickyMode]);

  const [celebration, setCelebration] = useState(null);
  const [miniCeleb, setMiniCeleb] = useState(null);
  const prevAllDone = useRef(null);
  const [celebrationsOn, setCelebrationsOn] = useLocalStorageState(CELEBRATIONS_STORAGE_KEY, true, {
    read: (raw) => raw !== "off",
    write: (v) => (v ? "on" : "off"),
  });

  const toggleCelebrations = useCallback(() => {
    setCelebrationsOn((prev) => {
      if (prev) {
        setCelebration(null);
        setMiniCeleb(null);
      }
      return !prev;
    });
  }, [setCelebrationsOn]);

  const celebrateTaskDone = useCallback((statut, nextTasks, origin) => {
    if (!celebrationsOn) return;
    if (!isDoneStatus(statut)) return;
    playTaskDoneSound();
    if (nextTasks.length > 0 && nextTasks.every(isTaskDone)) {
      setCelebration(pickCelebrationVariant());
      return;
    }
    setMiniCeleb({
      key: Date.now(),
      x: origin?.x,
      y: origin?.y,
    });
  }, [celebrationsOn]);

  // ── Données et features ──
  const store = useTasks({ onTaskDone: celebrateTaskDone });
  const {
    loading, tasks, projects, saveError, tasksRef,
    deleteTask, archiveTask, unarchiveTask, moveTask,
    addTimeLog, editTimeLog, deleteTimeLog,
  } = store;

  const activeTasks = useMemo(() => tasks.filter((tk) => !tk.archived), [tasks]);

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

  const deferredActiveTasks = React.useDeferredValue(activeTasks);
  const projectProgress = useMemo(
    () => computeProjectProgress(deferredActiveTasks, projects),
    [deferredActiveTasks, projects]
  );

  // ── Guide de démarrage : affiché à la première ouverture, rejouable via Préférences ──
  const [tutorialOpen, setTutorialOpen] = useState(() => {
    try {
      return !localStorage.getItem(TUTORIAL_STORAGE_KEY);
    } catch (e) {
      return false;
    }
  });

  const openTutorial = useCallback(() => setTutorialOpen(true), []);
  const closeTutorial = useCallback(() => {
    setTutorialOpen(false);
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
    } catch (e) {
      // stockage indisponible
    }
  }, []);

  const toggleSidebar = useCallback(() => setSidebarCollapsed((v) => !v), [setSidebarCollapsed]);
  const toggleDesktopPet = useCallback(() => setDesktopPetEnabled((v) => !v), [setDesktopPetEnabled]);
  const closeEditing = useCallback(() => setEditing(null), []);
  const clearCelebration = useCallback(() => setCelebration(null), []);
  const clearMiniCeleb = useCallback(() => setMiniCeleb(null), []);

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

  const doneCount = useMemo(() => activeTasks.filter(isTaskDone).length, [activeTasks]);
  const inProgressCount = useMemo(
    () => activeTasks.filter((tk) => !isTaskDone(tk) && statusOf(tk.statut).weight > 10).length,
    [activeTasks]
  );
  const allDone = activeTasks.length > 0 && doneCount === activeTasks.length;

  useEffect(() => {
    if (loading) return;
    if (prevAllDone.current === null) {
      prevAllDone.current = allDone;
      return;
    }
    if (allDone && !prevAllDone.current && celebrationsOn) setCelebration(pickCelebrationVariant());
    prevAllDone.current = allDone;
  }, [allDone, loading, celebrationsOn]);

  useEffect(() => {
    if (celebration) setMiniCeleb(null);
  }, [celebration]);

  // ── Dérivés ──
  const sortTasks = useCallback(
    (list) => {
      const arr = [...list];
      arr.sort((a, b) => {
        if (sortBy === "priorite") return prioOf(a.priorite).order - prioOf(b.priorite).order;
        if (sortBy === "statut") return statusOf(a.statut).weight - statusOf(b.statut).weight;
        if (sortBy === "projet") return a.projet.localeCompare(b.projet);
        if (sortBy === "echeance") return (a.echeance || "9999-99-99").localeCompare(b.echeance || "9999-99-99");
        return 0;
      });
      return arr;
    },
    [sortBy]
  );

  const deferredSearch = React.useDeferredValue(search);
  const searchTerms = useMemo(() => compileSearchTerms(deferredSearch), [deferredSearch]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(
      (tk) =>
        !tk.archived &&
        (!filterProjects.length || filterProjects.includes(tk.projet)) &&
        (!filterStatuts.length ||
          filterStatuts.includes(tk.statut) ||
          (filterStatuts.includes("termine") && isTaskDone(tk))) &&
        taskMatchesTerms(tk, searchTerms)
    );
  }, [tasks, filterProjects, filterStatuts, searchTerms]);

  const sortedTasks = useMemo(() => sortTasks(filteredTasks), [filteredTasks, sortTasks]);

  const archivedTasks = useMemo(
    () => tasks.filter((tk) => tk.archived && taskMatchesTerms(tk, searchTerms)),
    [tasks, searchTerms]
  );
  const sortedArchivedTasks = useMemo(() => sortTasks(archivedTasks), [archivedTasks, sortTasks]);

  const listResetKey = `${filterProjects.join(",")}|${filterStatuts.join(",")}|${deferredSearch}|${sortBy}|${viewMode}`;

  const globalProgress = useMemo(() => {
    if (activeTasks.length === 0) return 0;
    const sum = activeTasks.reduce((acc, tk) => acc + statusOf(tk.statut).weight, 0);
    return Math.round(sum / activeTasks.length);
  }, [activeTasks]);

  // ── Actions ──
  const openNewTask = useCallback(() => {
    React.startTransition(() => {
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
    });
  }, [filterProjects, projects]);

  const openEditTask = useCallback((task) => {
    React.startTransition(() => {
      setEditing({ ...task });
    });
  }, []);

  const handleRevealTask = useCallback((id) => {
    const task = tasksRef.current.find((tk) => tk.id === id);
    if (task) openEditTask(task);
    else setToast({ type: "error", text: t("plugin_task_not_found") });
  }, [tasksRef, openEditTask, t]);

  const handlePluginToast = useCallback((message) => setToast({ type: "success", text: message }), []);

  const handleDeleteTask = useCallback((id) => {
    deleteTask(id);
    setConfirm(null);
  }, [deleteTask]);

  const handleArchiveTask = useCallback((id) => {
    archiveTask(id);
    setConfirm(null);
  }, [archiveTask]);

  const handleUnarchiveTask = useCallback((id) => {
    unarchiveTask(id);
    setConfirm(null);
  }, [unarchiveTask]);

  const toggleFilterProject = useCallback((name) => {
    setFilterProjects((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]
    );
  }, []);

  const toggleFilterStatut = useCallback((id) => {
    setFilterStatuts((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }, []);

  const handleClearProjectFilters = useCallback(() => setFilterProjects([]), []);
  const handleClearStatuts = useCallback(() => setFilterStatuts([]), []);

  const handleRemoveProject = useCallback((name) => {
    if (removeProject(name)) {
      setFilterProjects((prev) => prev.filter((p) => p !== name));
    }
  }, [removeProject]);

  const handleRenameProject = useCallback((oldName, newName) => {
    if (renameProject(oldName, newName)) {
      const trimmed = newName.trim();
      setFilterProjects((prev) => prev.map((p) => (p === oldName ? trimmed : p)));
    }
  }, [renameProject]);

  const handleAskDelete = useCallback((id) => setConfirm({ id, action: "delete" }), []);
  const handleAskArchive = useCallback((id) => setConfirm({ id, action: "archive" }), []);
  const handleAskUnarchive = useCallback((id) => setConfirm({ id, action: "unarchive" }), []);
  const handleCancelConfirm = useCallback(() => setConfirm(null), []);

  const confirmProps = useMemo(() => ({
    confirmId: confirm?.id ?? null,
    confirmAction: confirm?.action ?? null,
    onAskDelete: handleAskDelete,
    onAskArchive: handleAskArchive,
    onAskUnarchive: handleAskUnarchive,
    onCancelConfirm: handleCancelConfirm,
  }), [confirm?.id, confirm?.action, handleAskDelete, handleAskArchive, handleAskUnarchive, handleCancelConfirm]);

  const timeLogOps = useMemo(() => ({
    addTimeLog,
    editTimeLog,
    deleteTimeLog,
  }), [addTimeLog, editTimeLog, deleteTimeLog]);

  const boardProps = useMemo(() => ({
    onMove: moveTask,
    onEdit: openEditTask,
    onDelete: handleDeleteTask,
    onArchive: handleArchiveTask,
    onUnarchive: handleUnarchiveTask,
    ...confirmProps,
  }), [moveTask, openEditTask, handleDeleteTask, handleArchiveTask, handleUnarchiveTask, confirmProps]);

  const rowProps = useMemo(() => ({
    onEdit: openEditTask,
    onDelete: handleDeleteTask,
    onArchive: handleArchiveTask,
    onUnarchive: handleUnarchiveTask,
    ...confirmProps,
    timeLogOps,
    taskColumns,
  }), [openEditTask, handleDeleteTask, handleArchiveTask, handleUnarchiveTask, confirmProps, timeLogOps, taskColumns]);

  const appClassName =
    "trk-app" +
    ` theme-${theme}` +
    (maximized ? " trk-app-maximized" : "") +
    (isLightTheme(theme) ? " light" : "") +
    (theme === "random" ? " random" : "") +
    (stickyMode ? " sticky" : "") +
    (windowHidden ? " is-hidden" : "");

  const randomStyle = useMemo(
    () => (theme === "random" ? randomThemeVars(randomSeed) : undefined),
    [theme, randomSeed]
  );

  // ── Rendu ──
  return (
    <FocusProvider focusId={focus.focusId} focusStartedAt={focus.focusStartedAt}>
        <div
          className={appClassName}
          style={randomStyle}
          data-pattern={theme === "random" ? randomThemePattern(randomSeed) : undefined}
        >
          <TitleBar maximized={maximized} />
          <DynamicIsland
            focusSession={focus}
            onEditTask={openEditTask}
            pomodoroSession={pomodoro}
            petState={petState}
            desktopPetEnabled={desktopPetEnabled}
            onToggleDesktopPet={toggleDesktopPet}
          />

          <div className="trk-content">
          {loading ? (
            <div className="trk-loading">{t("loading")}</div>
          ) : (
            <>
              <AppHeader
                globalProgress={globalProgress}
                doneCount={doneCount}
                inProgressCount={inProgressCount}
                totalTasks={activeTasks.length}
                onImport={backup.importData}
                onExport={backup.exportData}
                ioBusy={backup.ioBusy}
                onOpenTutorial={openTutorial}
                celebrationsOn={celebrationsOn}
                onToggleCelebrations={toggleCelebrations}
                theme={theme}
                randomSeed={randomSeed}
                onToggleTheme={toggleTheme}
                onSelectTheme={selectTheme}
                stickyMode={stickyMode}
                onToggleStickyMode={toggleStickyMode}
                canUndo={store.canUndo}
                canRedo={store.canRedo}
                onUndo={store.undo}
                onRedo={store.redo}
              />

          <div className={"trk-layout" + (sidebarCollapsed ? " sidebar-collapsed" : "")}>
            <ProjectSidebar
              totalTasks={activeTasks.length}
              projectProgress={projectProgress}
              filterProjects={filterProjects}
              onToggleFilter={toggleFilterProject}
              onClearFilters={handleClearProjectFilters}
              onAdd={addProject}
              onRemove={handleRemoveProject}
              onRename={handleRenameProject}
              collapsed={sidebarCollapsed}
              onToggleCollapse={toggleSidebar}
            />

            <main className="trk-main">
              <TaskToolbar
                search={search}
                onSearchChange={setSearch}
                filterStatuts={filterStatuts}
                onToggleStatut={toggleFilterStatut}
                onClearStatuts={handleClearStatuts}
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
                  boardProps={boardProps}
                />
              ) : viewMode === "insights" ? (
                <Suspense fallback={<div className="trk-loading">{t("loading")}</div>}>
                  <ChartsSection
                    tasks={deferredActiveTasks}
                    projects={projects}
                    onEditTask={openEditTask}
                  />
                </Suspense>
              ) : viewMode === "plugins" ? (
                <Suspense fallback={<div className="trk-loading">{t("loading")}</div>}>
                  <PluginsSection
                    tasks={tasks}
                    projects={projects}
                    theme={theme}
                    randomSeed={randomSeed}
                    onRevealTask={handleRevealTask}
                    onToast={handlePluginToast}
                  />
                </Suspense>
              ) : viewMode === "archived" ? (
                <TaskList
                  tasks={sortedArchivedTasks}
                  resetKey={listResetKey}
                  onNewTask={undefined}
                  emptyLabel={t("empty_archived_list")}
                  rowProps={rowProps}
                />
              ) : (
                <TaskList
                  tasks={sortedTasks}
                  resetKey={listResetKey}
                  onNewTask={openNewTask}
                  rowProps={rowProps}
                />
              )}
            </main>
          </div>

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

          {tutorialOpen && (
            <Suspense fallback={null}>
              <Tutorial open={tutorialOpen} onClose={closeTutorial} />
            </Suspense>
          )}

          {saveError && (
            <div className="trk-save-error">
              <AlertTriangle size={13} /> {t("save_error")}
            </div>
          )}

          {backup.pendingImport && (
            <Suspense fallback={null}>
              <ImportConfirmModal
                pendingImport={backup.pendingImport}
                onConfirm={backup.confirmImport}
                onCancel={backup.cancelImport}
              />
            </Suspense>
          )}

          {celebration && celebrationsOn && (
            <Suspense fallback={null}>
              <CelebrationOverlay
                variant={celebration.variant}
                legendary={celebration.legendary}
                title={t(celebration.legendary ? "celebrate_legendary_title" : `celebrate_title_${celebration.msg}`)}
                subtitle={t(celebration.legendary ? "celebrate_legendary_sub" : `celebrate_sub_${celebration.msg}`)}
                onDone={clearCelebration}
              />
            </Suspense>
          )}

          {miniCeleb && !celebration && celebrationsOn && (
            <Suspense fallback={null}>
              <MiniCelebration
                key={miniCeleb.key || miniCeleb}
                origin={miniCeleb}
                playSound={false}
                onDone={clearMiniCeleb}
              />
            </Suspense>
          )}

          <Toast toast={toast} />

          {editing && (
            <Suspense fallback={null}>
              <TaskModal
                initial={editing}
                storeTask={editing.id ? tasks.find((tk) => tk.id === editing.id) : null}
                projects={projects}
                onSubmit={store.upsertTask}
                onClose={closeEditing}
                timeLogOps={timeLogOps}
                onToast={setToast}
                taskPanels={taskPanels}
              />
            </Suspense>
          )}
        </>
      )}
      </div>
    </div>
    <DesktopPetSync
      enabled={desktopPetEnabled}
      focusTask={focus.focusTask}
      focusStartedAt={focus.focusStartedAt}
      pomodoro={pomodoro}
      petDna={petDna}
      theme={theme}
    />
    </FocusProvider>
  );
}
