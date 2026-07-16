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
