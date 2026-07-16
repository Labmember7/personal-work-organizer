import type { Project, Task } from "../../lib/types";

interface ProjectStore {
  tasks: Task[];
  projects: Project[];
  saveProjects: (next: Project[]) => void;
  saveBoth: (nextTasks: Task[], nextProjects: Project[]) => void;
}

export interface ProjectOps {
  addProject: (name: string) => boolean;
  removeProject: (name: string) => boolean;
  renameProject: (oldName: string, newName: string) => boolean;
}

// Opérations sur les projets, bâties sur le store de useTasks (tâches et
// projets sont persistés ensemble). Chaque opération rend true si elle a
// été appliquée, pour que l'appelant synchronise ses filtres.
export function useProjects({ tasks, projects, saveProjects, saveBoth }: ProjectStore): ProjectOps {
  // Rend true si le projet a été ajouté (nom non vide et pas de doublon).
  const addProject = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed || projects.includes(trimmed)) return false;
    saveProjects([...projects, trimmed]);
    return true;
  };

  // Refusé si des tâches y sont encore rattachées.
  const removeProject = (name: string): boolean => {
    if (tasks.some((t) => t.projet === name)) return false;
    saveProjects(projects.filter((p) => p !== name));
    return true;
  };

  // Renomme le projet et réaffecte ses tâches en une seule sauvegarde.
  const renameProject = (oldName: string, newName: string): boolean => {
    const trimmed = newName.trim();
    if (!oldName || !trimmed || trimmed === oldName) return false;
    if (projects.includes(trimmed)) return false;
    saveBoth(
      tasks.map((t) => (t.projet === oldName ? { ...t, projet: trimmed } : t)),
      projects.map((p) => (p === oldName ? trimmed : p))
    );
    return true;
  };

  return { addProject, removeProject, renameProject };
}
