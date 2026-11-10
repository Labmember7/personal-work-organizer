import React, { useMemo } from "react";
import { Columns3, Zap } from "lucide-react";
import { useLang } from "../../i18n.jsx";
import { SIMPLE_STATUSES, isSimpleTask } from "../../utils";
import { EmptyState } from "../../components/EmptyState.jsx";
import { KanbanBoard } from "./KanbanBoard.jsx";

// Vue kanban complète : un tableau pour les tâches workflow (6 statuts) et
// un pour les tâches simples (3 statuts), avec libellés quand les deux
// familles coexistent.
export const KanbanSection = React.memo(function KanbanSection({ tasks, onNewTask, boardProps }) {
  const { t } = useLang();

  const standardTasks = useMemo(() => tasks.filter((tk) => !isSimpleTask(tk)), [tasks]);
  const simpleTasks = useMemo(() => tasks.filter(isSimpleTask), [tasks]);

  if (tasks.length === 0) {
    return <EmptyState label={t("empty_task_list")} actionLabel={t("new_task")} onAction={onNewTask} />;
  }

  return (
    <>
      {standardTasks.length > 0 && (
        <>
          {simpleTasks.length > 0 && (
            <div className="trk-board-label">
              <Columns3 size={11} /> {t("kanban_standard")}
            </div>
          )}
          <KanbanBoard tasks={standardTasks} {...boardProps} />
        </>
      )}
      {simpleTasks.length > 0 && (
        <>
          {standardTasks.length > 0 && (
            <div className="trk-board-label">
              <Zap size={11} /> {t("kanban_simple")}
            </div>
          )}
          <KanbanBoard tasks={simpleTasks} statuses={SIMPLE_STATUSES} {...boardProps} />
        </>
      )}
    </>
  );
});
