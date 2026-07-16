import React from "react";

// Barre de progression fine, colorée selon le niveau d'avancement.
export function ProgressBar({ value, height = 6 }) {
  const color = value < 35 ? "var(--danger)" : value < 70 ? "var(--warn)" : "var(--ok)";
  return (
    <div className="trk-pbar" style={{ height }}>
      <div className="trk-pbar-fill" style={{ width: `${value}%`, background: color }} />
    </div>
  );
}
