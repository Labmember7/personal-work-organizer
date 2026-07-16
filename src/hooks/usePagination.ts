import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

export interface PaginationResult<T> {
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  totalPages: number;
  pageItems: T[];
}

// Pagination réutilisable : découpe items, borne la page courante et
// revient en page 1 quand resetKey change (filtres, recherche, tri…).
export function usePagination<T>(items: T[], pageSize: number, resetKey: unknown): PaginationResult<T> {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [items, currentPage, pageSize]
  );
  return { page: currentPage, setPage, totalPages, pageItems };
}
