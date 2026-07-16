import React from "react";
import { useLang } from "../../i18n.jsx";
import { usePagination } from "../../hooks/usePagination";
import { Pagination } from "../../components/Pagination.jsx";
import { EmptyState } from "../../components/EmptyState.jsx";
import { TaskRow } from "./TaskRow.jsx";

const PAGE_SIZE = 6;

// Vue liste : tâches triées/filtrées par l'appelant, paginées ici.
// `resetKey` ramène en page 1 quand filtres, recherche ou tri changent.
export function TaskList({ tasks, resetKey, onNewTask, rowProps }) {
  const { t } = useLang();
  const { page, setPage, totalPages, pageItems } = usePagination(tasks, PAGE_SIZE, resetKey);

  return (
    <div className="trk-task-list">
      {tasks.length === 0 && (
        <EmptyState label={t("empty_task_list")} actionLabel={t("new_task")} onAction={onNewTask} />
      )}
      {pageItems.map((task) => (
        <TaskRow key={task.id} task={task} {...rowProps} />
      ))}
      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
