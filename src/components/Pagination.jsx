import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLang, pageOfLabel } from "../i18n.jsx";

function pageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < total - 1) pages.push("…");
  pages.push(total);
  return pages;
}

// Pagination numérotée (liste) ou compacte « n/N » (colonnes kanban, sidebar).
export function Pagination({ page, totalPages, onChange, compact = false }) {
  const { t, lang } = useLang();
  if (compact) {
    return (
      <div className="trk-pagination trk-pagination-compact">
        <button
          type="button"
          className="trk-page-btn trk-page-nav"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          title={t("page_prev")}
        >
          <ChevronLeft size={13} />
        </button>
        <span className="trk-page-info">{page}/{totalPages}</span>
        <button
          type="button"
          className="trk-page-btn trk-page-nav"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          title={t("page_next")}
        >
          <ChevronRight size={13} />
        </button>
      </div>
    );
  }
  if (totalPages <= 1) return null;
  return (
    <div className="trk-pagination">
      <button
        type="button"
        className="trk-page-btn trk-page-nav"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
        title={t("page_prev")}
      >
        <ChevronLeft size={15} />
      </button>
      {pageNumbers(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} className="trk-page-ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={"trk-page-btn" + (p === page ? " active" : "")}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        )
      )}
      <button
        type="button"
        className="trk-page-btn trk-page-nav"
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
        title={t("page_next")}
      >
        <ChevronRight size={15} />
      </button>
      <span className="trk-page-info">{pageOfLabel(lang, page, totalPages)}</span>
    </div>
  );
}
