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

    prio_critique: "Critique",
    prio_haute: "Haute",
    prio_moyenne: "Moyenne",
    prio_basse: "Basse",
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

    prio_critique: "Critical",
    prio_haute: "High",
    prio_moyenne: "Medium",
    prio_basse: "Low",
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

export const statusCountLabel = (t, lang, n) => {
  if (n === 0) return t("all_statuses");
  return lang === "fr" ? `${n} statut${n > 1 ? "s" : ""}` : `${n} status${n > 1 ? "es" : ""}`;
};
