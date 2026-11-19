import { useCallback, useMemo, useRef, useState } from "react";
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
// Les callbacks sont stabilisés via refs pour préserver React.memo sur AppHeader.
export function useBackup({ tasks, projects, saveBoth, onImported, onToast, t }: UseBackupArgs): BackupApi {
  const [pendingImport, setPendingImport] = useState<{ tasks: Task[]; projects: Project[] } | null>(null);
  const [ioBusy, setIoBusy] = useState(false);

  const stateRef = useRef({ tasks, projects, ioBusy, pendingImport, onImported, onToast, t });
  stateRef.current = { tasks, projects, ioBusy, pendingImport, onImported, onToast, t };

  const exportData = useCallback(async () => {
    const { tasks: curTasks, projects: curProjects, ioBusy: busy, onToast: toast, t: tr } = stateRef.current;
    if (!window.dataIO || busy) return;
    setIoBusy(true);
    try {
      const result = await window.dataIO.export(buildBackupPayload(curTasks, curProjects));
      if (!result.canceled) toast({ type: "success", text: tr("export_success") });
    } catch (e) {
      toast({ type: "error", text: tr("export_error") });
    } finally {
      setIoBusy(false);
    }
  }, []);

  const importData = useCallback(async () => {
    const { ioBusy: busy, onToast: toast, t: tr } = stateRef.current;
    if (!window.dataIO || busy) return;
    setIoBusy(true);
    try {
      const result = await window.dataIO.import();
      if (result.canceled) return;
      if (result.error || !isValidBackupData(result.data)) {
        toast({ type: "error", text: tr("import_invalid") });
        return;
      }
      setPendingImport(normalizeBackupData(result.data));
    } catch (e) {
      toast({ type: "error", text: tr("import_error") });
    } finally {
      setIoBusy(false);
    }
  }, []);

  const confirmImport = useCallback(() => {
    const { pendingImport: pending, onImported: imported, onToast: toast, t: tr } = stateRef.current;
    if (!pending) return;
    saveBoth(pending.tasks, pending.projects);
    setPendingImport(null);
    imported?.();
    toast({ type: "success", text: tr("import_success") });
  }, [saveBoth]);

  const cancelImport = useCallback(() => setPendingImport(null), []);

  return useMemo(
    () => ({ pendingImport, ioBusy, exportData, importData, confirmImport, cancelImport }),
    [pendingImport, ioBusy, exportData, importData, confirmImport, cancelImport]
  );
}
