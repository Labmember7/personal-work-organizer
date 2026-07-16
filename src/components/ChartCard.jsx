import React, { useState } from "react";
import { Maximize2, X } from "lucide-react";
import { useLang } from "../i18n.jsx";
import { useEscapeKey } from "../hooks/useEscapeKey";
import { HelpTip } from "../tips.jsx";

// Carte de graphique réutilisable : bouton focus -> modal agrandi
// avec le même graphique en grand et un tableau de détails.
export function ChartCard({ title, empty, emptyLabel, render, details, tip, className = "" }) {
  const { t } = useLang();
  const [focused, setFocused] = useState(false);

  useEscapeKey(() => setFocused(false), focused);

  return (
    <div className={"trk-chart-card " + className}>
      <div className="trk-chart-head">
        <div className="trk-chart-title">{title}{tip && <HelpTip tipKey={tip} />}</div>
        {!empty && (
          <button
            type="button"
            className="trk-icon-btn trk-chart-focus-btn"
            onClick={() => setFocused(true)}
            title={t("focus_chart")}
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>
      {empty ? (
        <div className="trk-empty" style={{ padding: 20 }}>{emptyLabel}</div>
      ) : (
        render(200, false)
      )}
      {focused && (
        <div className="trk-modal-overlay" onClick={() => setFocused(false)}>
          <div className="trk-modal trk-chart-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
            <div className="trk-modal-header">
              <span className="trk-modal-title">{title}</span>
              <button className="trk-icon-btn" onClick={() => setFocused(false)}><X size={16} /></button>
            </div>
            <div className="trk-chart-modal-body">
              {render(460, true)}
              {details && (
                <table className="trk-chart-details">
                  <thead>
                    <tr>{details.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {details.rows.map((r, i) => (
                      <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
