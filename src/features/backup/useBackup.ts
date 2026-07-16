import { useState } from "react";
import type { Project, Task } from "../../lib/types";
import { isValidBackupData, normalizeBackupData, buildBackupPayload } from "../../lib/backup";

export interface ToastMessage {
  type: "success" | "error";
  text: string;
}

interface UseBackupArgs {
  tasks: Task[];
  projects: Project[];
  saveBoth: (nextTasks: Task[], nextProjects: Project[]) => void;
  onImported?: () => void;
  onToast: (toast: ToastMessage) => void;
  t: (key: string) => string;
}

export interface BackupApi {
  pendingImport: { tasks: Task[]; projects: Project[] } | null;
  ioBusy: boolean;
  exportData: () => Promise<void>;
  importData: () => Promise<void>;
  confirmImport: () => void;
  cancelImport: () => void;
}

// Export / import de sauvegarde via les boîtes de dialogue natives (IPC).
// L'import passe par une étape de confirmation (pendingImport) avant de
// remplacer les données. `onToast` remonte les succès/erreurs à l'UI.
export function useBackup({ tasks, projects, saveBoth, onImported, onToast, t }: UseBackupArgs): BackupApi {
  const [pendingImport, setPendingImport] = useState<{ tasks: Task[]; projects: Project[] } | null>(null);
  const [ioBusy, setIoBusy] = useState(false);

  const exportData = async () => {
    if (!window.dataIO || ioBusy) return;
    setIoBusy(true);
    try {
      const result = await window.dataIO.export(buildBackupPayload(tasks, projects));
      if (!result.canceled) onToast({ type: "success", text: t("export_success") });
    } catch (e) {
      onToast({ type: "error", text: t("export_error") });
    } finally {
      setIoBusy(false);
    }
  };

  const importData = async () => {
    if (!window.dataIO || ioBusy) return;
    setIoBusy(true);
    try {
      const result = await window.dataIO.import();
      if (result.canceled) return;
      if (result.error || !isValidBackupData(result.data)) {
        onToast({ type: "error", text: t("import_invalid") });
        return;
      }
      // Normalisation avant confirmation : champs manquants complétés et
      // projets réconciliés avec ceux référencés par les tâches.
      setPendingImport(normalizeBackupData(result.data));
    } catch (e) {
      onToast({ type: "error", text: t("import_error") });
    } finally {
      setIoBusy(false);
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    saveBoth(pendingImport.tasks, pendingImport.projects);
    setPendingImport(null);
    onImported?.();
    onToast({ type: "success", text: t("import_success") });
  };

  const cancelImport = () => setPendingImport(null);

  return { pendingImport, ioBusy, exportData, importData, confirmImport, cancelImport };
}
