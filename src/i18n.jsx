import React, { createContext, useContext, useState, useEffect } from "react";

export const LANG_STORAGE_KEY = "suivi-travaux-lang";

const dict = {
  fr: {
    titlebar_title: "Suivi des travaux",
    minimize: "Réduire",
    maximize: "Agrandir",
    restore: "Restaurer",
    close: "Fermer",

    gauge_caption: "AVANCEMENT",

    gantt_empty: "Pas encore de tâches avec une échéance",

    all_statuses: "Tous statuts",
    clear_selection: "Effacer la sélection",

    time_spent: "Temps passé",
    time_logged: "Temps enregistré",
    record_time: "Enregistrer du temps",
    duration_placeholder: "1h30",
    note_placeholder: "Note (optionnel)",
    add: "Ajouter",
    duration_format_error: "Format non reconnu (ex : 1h30, 45m, 90)",
    no_entry: "Aucune entrée",
    remove: "Supprimer",
    edit_entry: "Modifier l'entrée",

    loading: "Chargement du suivi…",
    eyebrow: "CENTRE DE PILOTAGE",
    app_title: "Suivi des travaux par projet",

    projects: "PROJETS",
    new_project: "Nouveau projet",
    project_name_placeholder: "Nom du projet",
    toggle_project_filter: "Cliquer pour ajouter/retirer ce projet du filtre",
    rename_project: "Renommer ce projet",
    remove_project: "Retirer ce projet",

    search_placeholder: "Rechercher une tâche…",
    sort_priority: "Trier : priorité",
    sort_status: "Trier : statut",
    sort_project: "Trier : projet",
    sort_due: "Trier : échéance",
    new_task: "Nouvelle tâche",

    empty_task_list: "Aucune tâche ne correspond. Ajoutez-en une pour démarrer le suivi.",
    delete_confirm: "Supprimer ?",

    chart_status_distribution: "RÉPARTITION GLOBALE PAR STATUT",
    chart_project_progress: "AVANCEMENT PAR PROJET (PAR STATUT)",
    chart_priority_distribution: "RÉPARTITION PAR PRIORITÉ",
    chart_time_per_project: "TEMPS EFFECTIF PAR PROJET",
    chart_gantt: "ÉVOLUTION DES TÂCHES PAR PROJET (GANTT)",
    no_data: "Pas encore de données",
    no_time_logged: "Pas encore de temps enregistré",
    time_tooltip: "Temps",

    save_error: "La sauvegarde a échoué, tes dernières modifications ne sont peut-être pas enregistrées.",

    edit_task: "Modifier la tâche",
    field_title: "Titre",
    title_placeholder: "Ex : Corriger la numérotation des slides",
    field_description: "Description (optionnel)",
    description_placeholder: "Écris ta description en Markdown (**gras**, *italique*, listes, `code`…)",
    md_mode_write: "Écrire",
    md_mode_preview: "Aperçu",
    md_mode_split: "Partagé",
    md_syntax_hint: "Syntaxe Markdown",
    md_preview_empty: "Rien à prévisualiser pour le moment.",
    field_project: "Projet",
    field_priority: "Priorité",
    field_status: "Statut",
    field_start: "Début (optionnel)",
    field_due: "Échéance (optionnel)",
    field_assignee: "Assigné à (optionnel)",
    assignee_placeholder: "Nom de la personne",
    field_time: "Temps",
    time_hint: "Le suivi du temps sera disponible une fois la tâche ajoutée.",
    cancel: "Annuler",
    save: "Enregistrer",
    unsaved_changes_title: "Modifications non enregistrées",
    unsaved_changes_body: "Tu as des modifications non enregistrées. Les abandonner ?",
    keep_editing: "Continuer l'édition",
    discard_changes: "Abandonner",

    status_analyser: "À analyser",
    status_implementer: "À implémenter",
    status_revue: "En revue",
    status_integrer: "À intégrer",
    status_valider: "À valider",
    status_termine: "Terminé",

    status_todo: "À faire",
    status_doing: "En cours",
    status_done: "Terminé",

    field_type: "Type de tâche",
    type_standard: "Workflow (6 statuts)",
    type_simple: "Simple (3 états)",
    type_simple_tag: "Simple",
    kanban_standard: "Tâches workflow",
    kanban_simple: "Tâches simples",

    focus_zone_title: "ZONE DE FOCUS",
    focus_zone_tooltip: "Glissez une tâche ici pour vous concentrer dessus. Une seule à la fois — le temps passé est suivi automatiquement.",
    focus_zone_empty: "Glissez une tâche ici",
    focus_zone_hint: "Une seule tâche à la fois",
    focus_cooking: "EN CUISINE",
    focus_mark_done: "Terminer",
    focus_release: "Retirer du focus",
    focus_advance: "Passer à l'étape suivante",
    focus_log_note: "Session focus",
    focus_reduce: "Réduire la zone de focus",
    focus_expand: "Ouvrir la zone de focus",

    prio_critique: "Critique",
    prio_haute: "Haute",
    prio_moyenne: "Moyenne",
    prio_basse: "Basse",

    export_data: "Exporter",
    import_data: "Importer",
    export_success: "Données exportées avec succès.",
    export_error: "L'export a échoué.",
    import_success: "Données importées avec succès.",
    import_error: "L'import a échoué.",
    import_invalid: "Fichier invalide : ce n'est pas un export de sauvegarde reconnu.",
    import_confirm_title: "Remplacer les données actuelles ?",
    import_confirm_body: "Cet import va remplacer toutes les tâches et tous les projets actuels. Cette action est irréversible.",
    import_confirm_action: "Remplacer",
    import_task_count: "tâche(s)",
    import_project_count: "projet(s)",

    view_list: "Liste",
    view_kanban: "Kanban",
    page_prev: "Page précédente",
    page_next: "Page suivante",
    kanban_empty_col: "Déposer une tâche ici",
    col_search_placeholder: "Filtrer…",
    prio_all: "Toutes priorités",
    focus_chart: "Agrandir le graphique",
    theme_light: "Passer en thème clair",
    theme_dark: "Passer en thème sombre",
    celebrations_disable: "Désactiver les célébrations (effets et sons)",
    celebrations_enable: "Activer les célébrations (effets et sons)",
    confirm_delete_yes: "Confirmer la suppression",
    detail_count: "Nombre",
    detail_share: "Part",
    detail_progress: "Avancement",
    detail_total: "Total",

    celebrate_title_1: "Mission accomplie",
    celebrate_sub_1: "TOUTES LES TÂCHES SONT TERMINÉES",
    celebrate_title_2: "Victoire totale",
    celebrate_sub_2: "LE TABLEAU EST PARFAITEMENT VIDE",
    celebrate_title_3: "Objectif atteint",
    celebrate_sub_3: "CHAQUE TÂCHE MENÉE À SON TERME",
    celebrate_title_4: "Exécution impeccable",
    celebrate_sub_4: "RIEN NE RESTE EN SUSPENS",
    celebrate_legendary_title: "Un instant légendaire",
    celebrate_legendary_sub: "LES ASTRES S'ALIGNENT — CÉLÉBRATION D'EXCEPTION",

    help_label: "Aide",
    help_tutorial: "Revoir le guide de démarrage",

    tip_progress_title: "Avancement global",
    tip_progress_body: "Cette jauge est comme la batterie d'un téléphone : elle se remplit à mesure que tu termines des tâches. 100 % = tout est fini.",
    tip_projects_title: "Projets",
    tip_projects_body: "Un projet est comme un classeur : chaque tâche est rangée dedans. Clique sur un projet pour ne voir que ses tâches, re-clique pour tout revoir.",
    tip_tasks_title: "Tes tâches",
    tip_tasks_body: "Chaque tâche est comme un post-it : un titre, une priorité et une échéance. La recherche sert de lampe de poche pour retrouver un post-it, le tri les range, et « Nouvelle tâche » en colle un nouveau. Liste = liste de courses ; Kanban = tableau en liège à colonnes où tu fais glisser les tâches pour les faire avancer.",
    tip_backup_title: "Sauvegarde",
    tip_backup_body: "Exporter, c'est faire une photocopie de ton carnet pour la mettre à l'abri dans un fichier. Importer, c'est recopier une photocopie dans le carnet — attention, ça remplace tout le contenu actuel.",
    tip_chart_status_title: "Répartition par statut",
    tip_chart_status_body: "Ce camembert est comme une pizza découpée : chaque part représente l'étape où se trouvent tes tâches (à faire, en cours, terminé…). Plus une part est grande, plus il y a de tâches à cette étape.",
    tip_chart_projects_title: "Avancement par projet",
    tip_chart_projects_body: "Chaque barre est un projet, comme des coureurs sur une piste : les couleurs montrent où en sont ses tâches, et plus la partie « terminé » grandit, plus le projet approche de la ligne d'arrivée.",
    tip_chart_priority_title: "Répartition par priorité",
    tip_chart_priority_body: "Ce graphique compte tes tâches par urgence, comme le tri aux urgences d'un hôpital : beaucoup de « critique », c'est le signal qu'il faut s'en occuper en premier.",
    tip_chart_time_title: "Temps par projet",
    tip_chart_time_body: "Montre où part ton temps, comme un compteur d'eau sur chaque robinet : plus la barre d'un projet est longue, plus il a consommé d'heures.",
    tip_chart_gantt_title: "Frise des tâches (Gantt)",
    tip_chart_gantt_body: "Chaque barre est une tâche posée sur un calendrier, comme les réservations d'un hôtel : on voit quand elle commence, quand elle doit finir, et la ligne verticale marque aujourd'hui.",

    tuto_title: "Guide de démarrage",
    tuto_skip: "Passer le guide",
    tuto_prev: "Précédent",
    tuto_next: "Suivant",
    tuto_done: "C'est parti !",
    tuto_welcome_title: "Bienvenue !",
    tuto_welcome_body: "Cette application est ton carnet de bord : elle garde tout ce que tu as à faire, projet par projet. Ce petit guide te montre l'essentiel en quelques étapes — tu peux le revoir à tout moment avec le bouton « ? » en haut de l'écran.",
    tuto_projects_title: "Les projets",
    tuto_projects_body: "À gauche, tes projets sont comme des classeurs : chaque tâche est rangée dans l'un d'eux. « Nouveau projet » crée un classeur, et cliquer sur un projet filtre l'écran pour ne montrer que son contenu.",
    tuto_tasks_title: "Les tâches",
    tuto_tasks_body: "Une tâche, c'est un post-it : un titre, une priorité (à quel point c'est urgent) et une échéance (pour quand). Clique sur « Nouvelle tâche » pour en coller un, puis sur le crayon pour le modifier.",
    tuto_views_title: "Liste ou Kanban",
    tuto_views_body: "Deux façons de voir tes post-its : la Liste, comme une liste de courses à cocher, ou le Kanban, un tableau en liège à colonnes. Sur le Kanban, fais glisser une tâche vers la colonne suivante quand elle avance.",
    tuto_focus_title: "La zone de focus",
    tuto_focus_body: "En bas à droite, la zone de focus est comme une plaque de cuisson : pose UNE tâche dessus et elle « cuit » — le temps passé est compté automatiquement jusqu'à ce que tu la retires ou la termines.",
    tuto_time_title: "Le temps passé",
    tuto_time_body: "Chaque tâche a un petit chronomètre (l'icône horloge). Note le temps passé comme sur une feuille d'heures : « 1h30 », « 45m »… Pratique pour savoir où partent tes journées.",
    tuto_charts_title: "Les graphiques",
    tuto_charts_body: "En bas, les graphiques sont le tableau de bord de ta voiture : un coup d'œil suffit pour voir si tout roule. Clique sur l'icône d'agrandissement d'un graphique pour voir le détail.",
    tuto_backup_title: "Sauvegarder",
    tuto_backup_body: "« Exporter » fait une photocopie de toutes tes données dans un fichier, à garder précieusement. « Importer » restaure cette copie. Et si tu es perdu, cherche les petits « ? » à côté de chaque section !",
  },
  en: {
    titlebar_title: "Work tracker",
    minimize: "Minimize",
    maximize: "Maximize",
    restore: "Restore",
    close: "Close",

    gauge_caption: "PROGRESS",

    gantt_empty: "No tasks with a due date yet",

    all_statuses: "All statuses",
    clear_selection: "Clear selection",

    time_spent: "Time spent",
    time_logged: "Logged time",
    record_time: "Log time",
    duration_placeholder: "1h30",
    note_placeholder: "Note (optional)",
    add: "Add",
    duration_format_error: "Format not recognized (e.g. 1h30, 45m, 90)",
    no_entry: "No entry",
    remove: "Delete",
    edit_entry: "Edit entry",

    loading: "Loading…",
    eyebrow: "CONTROL CENTER",
    app_title: "Task tracking by project",

    projects: "PROJECTS",
    new_project: "New project",
    project_name_placeholder: "Project name",
    toggle_project_filter: "Click to add/remove this project from the filter",
    rename_project: "Rename this project",
    remove_project: "Remove this project",

    search_placeholder: "Search a task…",
    sort_priority: "Sort: priority",
    sort_status: "Sort: status",
    sort_project: "Sort: project",
    sort_due: "Sort: due date",
    new_task: "New task",

    empty_task_list: "No matching task. Add one to start tracking.",
    delete_confirm: "Delete?",

    chart_status_distribution: "GLOBAL BREAKDOWN BY STATUS",
    chart_project_progress: "PROGRESS BY PROJECT (BY STATUS)",
    chart_priority_distribution: "BREAKDOWN BY PRIORITY",
    chart_time_per_project: "TIME SPENT PER PROJECT",
    chart_gantt: "TASK TIMELINE BY PROJECT (GANTT)",
    no_data: "No data yet",
    no_time_logged: "No time logged yet",
    time_tooltip: "Time",

    save_error: "Save failed, your latest changes may not have been recorded.",

    edit_task: "Edit task",
    field_title: "Title",
    title_placeholder: "E.g.: Fix slide numbering",
    field_description: "Description (optional)",
    description_placeholder: "Write your description in Markdown (**bold**, *italic*, lists, `code`…)",
    md_mode_write: "Write",
    md_mode_preview: "Preview",
    md_mode_split: "Split",
    md_syntax_hint: "Markdown syntax",
    md_preview_empty: "Nothing to preview yet.",
    field_project: "Project",
    field_priority: "Priority",
    field_status: "Status",
    field_start: "Start (optional)",
    field_due: "Due date (optional)",
    field_assignee: "Assignee (optional)",
    assignee_placeholder: "Person's name",
    field_time: "Time",
    time_hint: "Time tracking will be available once the task is added.",
    cancel: "Cancel",
    save: "Save",
    unsaved_changes_title: "Unsaved changes",
    unsaved_changes_body: "You have unsaved changes. Discard them?",
    keep_editing: "Keep editing",
    discard_changes: "Discard",

    status_analyser: "To analyze",
    status_implementer: "To implement",
    status_revue: "In review",
    status_integrer: "To integrate",
    status_valider: "To validate",
    status_termine: "Done",

    status_todo: "To do",
    status_doing: "Doing",
    status_done: "Done",

    field_type: "Task type",
    type_standard: "Workflow (6 statuses)",
    type_simple: "Simple (3 states)",
    type_simple_tag: "Simple",
    kanban_standard: "Workflow tasks",
    kanban_simple: "Simple tasks",

    focus_zone_title: "FOCUS ZONE",
    focus_zone_tooltip: "Drag a task here to focus on it. One at a time — time spent is tracked automatically.",
    focus_zone_empty: "Drag a task here",
    focus_zone_hint: "One task at a time",
    focus_cooking: "COOKING",
    focus_mark_done: "Done",
    focus_release: "Remove from focus",
    focus_advance: "Move to next step",
    focus_log_note: "Focus session",
    focus_reduce: "Collapse the focus zone",
    focus_expand: "Expand the focus zone",

    prio_critique: "Critical",
    prio_haute: "High",
    prio_moyenne: "Medium",
    prio_basse: "Low",

    export_data: "Export",
    import_data: "Import",
    export_success: "Data exported successfully.",
    export_error: "Export failed.",
    import_success: "Data imported successfully.",
    import_error: "Import failed.",
    import_invalid: "Invalid file: not a recognized backup export.",
    import_confirm_title: "Replace current data?",
    import_confirm_body: "This import will replace all current tasks and projects. This action cannot be undone.",
    import_confirm_action: "Replace",
    import_task_count: "task(s)",
    import_project_count: "project(s)",

    view_list: "List",
    view_kanban: "Kanban",
    page_prev: "Previous page",
    page_next: "Next page",
    kanban_empty_col: "Drop a task here",
    col_search_placeholder: "Filter…",
    prio_all: "All priorities",
    focus_chart: "Expand chart",
    theme_light: "Switch to light theme",
    theme_dark: "Switch to dark theme",
    celebrations_disable: "Disable celebrations (effects and sounds)",
    celebrations_enable: "Enable celebrations (effects and sounds)",
    confirm_delete_yes: "Confirm deletion",
    detail_count: "Count",
    detail_share: "Share",
    detail_progress: "Progress",
    detail_total: "Total",

    celebrate_title_1: "Mission accomplished",
    celebrate_sub_1: "EVERY TASK COMPLETE",
    celebrate_title_2: "Total victory",
    celebrate_sub_2: "THE BOARD STANDS PERFECTLY CLEAR",
    celebrate_title_3: "Objective achieved",
    celebrate_sub_3: "EVERY LAST TASK BROUGHT HOME",
    celebrate_title_4: "Flawless execution",
    celebrate_sub_4: "NOTHING LEFT UNDONE",
    celebrate_legendary_title: "A legendary moment",
    celebrate_legendary_sub: "THE STARS ALIGN — A CELEBRATION FEW WILL EVER SEE",

    help_label: "Help",
    help_tutorial: "Replay the getting-started guide",

    tip_progress_title: "Overall progress",
    tip_progress_body: "This gauge works like a phone battery: it fills up as you finish tasks. 100% means everything is done.",
    tip_projects_title: "Projects",
    tip_projects_body: "A project is like a binder: every task is filed inside one. Click a project to see only its tasks, click again to see everything.",
    tip_tasks_title: "Your tasks",
    tip_tasks_body: "Each task is like a sticky note: a title, a priority and a due date. The search box is your flashlight to find a note, sorting tidies them up, and \"New task\" sticks a new one. List = a shopping list; Kanban = a cork board with columns where you drag tasks forward.",
    tip_backup_title: "Backup",
    tip_backup_body: "Export makes a photocopy of your notebook and stores it safely in a file. Import copies a photocopy back into the notebook — careful, it replaces everything currently there.",
    tip_chart_status_title: "Breakdown by status",
    tip_chart_status_body: "This pie is like a sliced pizza: each slice is a step your tasks are at (to do, doing, done…). The bigger the slice, the more tasks are at that step.",
    tip_chart_projects_title: "Progress by project",
    tip_chart_projects_body: "Each bar is a project, like runners on a track: the colors show where its tasks stand, and the bigger the \"done\" part grows, the closer the project is to the finish line.",
    tip_chart_priority_title: "Breakdown by priority",
    tip_chart_priority_body: "This chart counts your tasks by urgency, like triage in a hospital: lots of \"critical\" is the signal to deal with those first.",
    tip_chart_time_title: "Time per project",
    tip_chart_time_body: "Shows where your time goes, like a water meter on each tap: the longer a project's bar, the more hours it has used.",
    tip_chart_gantt_title: "Task timeline (Gantt)",
    tip_chart_gantt_body: "Each bar is a task laid on a calendar, like hotel bookings: you see when it starts, when it should end, and the vertical line marks today.",

    tuto_title: "Getting started",
    tuto_skip: "Skip the guide",
    tuto_prev: "Back",
    tuto_next: "Next",
    tuto_done: "Let's go!",
    tuto_welcome_title: "Welcome!",
    tuto_welcome_body: "This app is your logbook: it keeps everything you have to do, project by project. This short guide shows you the essentials in a few steps — you can replay it anytime with the \"?\" button at the top of the screen.",
    tuto_projects_title: "Projects",
    tuto_projects_body: "On the left, your projects are like binders: every task is filed in one of them. \"New project\" creates a binder, and clicking a project filters the screen to show only its content.",
    tuto_tasks_title: "Tasks",
    tuto_tasks_body: "A task is a sticky note: a title, a priority (how urgent it is) and a due date (for when). Click \"New task\" to stick one, then the pencil to edit it.",
    tuto_views_title: "List or Kanban",
    tuto_views_body: "Two ways to see your sticky notes: the List, like a shopping list to tick off, or the Kanban, a cork board with columns. On the Kanban, drag a task to the next column as it moves forward.",
    tuto_focus_title: "The focus zone",
    tuto_focus_body: "At the bottom right, the focus zone is like a cooking stove: drop ONE task on it and it \"cooks\" — the time spent is tracked automatically until you remove it or finish it.",
    tuto_time_title: "Time spent",
    tuto_time_body: "Every task has a small stopwatch (the clock icon). Log the time you spend like on a timesheet: \"1h30\", \"45m\"… Handy to know where your days go.",
    tuto_charts_title: "Charts",
    tuto_charts_body: "At the bottom, the charts are your car's dashboard: one glance tells you whether everything is running smoothly. Click a chart's expand icon to see the details.",
    tuto_backup_title: "Backing up",
    tuto_backup_body: "\"Export\" makes a photocopy of all your data into a file — keep it safe. \"Import\" restores that copy. And if you ever feel lost, look for the small \"?\" next to each section!",
  },
};

const LOCALES = { fr: "fr-FR", en: "en-US" };

const LangContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem(LANG_STORAGE_KEY) || "fr");

  useEffect(() => {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    if (typeof document !== "undefined") document.documentElement.lang = lang;
  }, [lang]);

  const t = (key) => dict[lang][key] ?? dict.fr[key] ?? key;
  const locale = LOCALES[lang];

  return (
    <LangContext.Provider value={{ lang, setLang, t, locale }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export const newTaskLabel = (t, editingId) => (editingId ? t("edit_task") : t("new_task"));

export const doneOfTotal = (t, lang, done, total) =>
  lang === "fr" ? `${done}/${total} terminées` : `${done}/${total} done`;

export const tasksTotalLabel = (lang, n) =>
  lang === "fr"
    ? `${n} tâche${n !== 1 ? "s" : ""} au total`
    : `${n} task${n !== 1 ? "s" : ""} in total`;

export const allProjectsLabel = (lang, n) =>
  lang === "fr" ? `Tous les projets (${n})` : `All projects (${n})`;

export const selectedCountLabel = (lang, n) =>
  lang === "fr" ? `${n} sélectionné${n > 1 ? "s" : ""}` : `${n} selected`;

export const pageOfLabel = (lang, page, total) =>
  lang === "fr" ? `Page ${page} / ${total}` : `Page ${page} of ${total}`;

export const statusCountLabel = (t, lang, n) => {
  if (n === 0) return t("all_statuses");
  return lang === "fr" ? `${n} statut${n > 1 ? "s" : ""}` : `${n} status${n > 1 ? "es" : ""}`;
};
