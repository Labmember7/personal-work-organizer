import React from "react";
import { useLang } from "../i18n.jsx";

// Jauge circulaire d'avancement global (0-100 %).
export function Gauge({ value }) {
  const { t } = useLang();
  const R = 52;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  const dash = C * (pct / 100);
  const color = pct < 35 ? "var(--danger)" : pct < 70 ? "var(--warn)" : "var(--ok)";
  const ticks = Array.from({ length: 24 });
  return (
    <svg viewBox="0 0 120 120" width="120" height="120">
      <g>
        {ticks.map((_, i) => {
          const angle = (i * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const x1 = 60 + 58 * Math.cos(rad);
          const y1 = 60 + 58 * Math.sin(rad);
          const x2 = 60 + 52 * Math.cos(rad);
          const y2 = 60 + 52 * Math.sin(rad);
          return (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--border)" strokeWidth="1.5" />
          );
        })}
      </g>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--gauge-track)" strokeWidth="9" />
      <circle
        cx="60" cy="60" r={R} fill="none" stroke={color} strokeWidth="9"
        strokeDasharray={`${dash} ${C}`} strokeLinecap="round"
        transform="rotate(-90 60 60)"
        style={{ transition: "stroke-dasharray 0.5s ease, stroke 0.5s ease" }}
      />
      <text x="60" y="57" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--text)"
        fontFamily="'Space Grotesk', sans-serif">
        {Math.round(pct)}%
      </text>
      <text x="60" y="74" textAnchor="middle" fontSize="8" fill="var(--text-dim)"
        fontFamily="'IBM Plex Mono', monospace" letterSpacing="0.5">
        {t("gauge_caption")}
      </text>
    </svg>
  );
}
