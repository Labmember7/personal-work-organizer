import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Flame, Sparkles } from "lucide-react";
import { AnimatedNumber } from "./AnimatedNumber.jsx";
import { useLang, doneOfTotal } from "../i18n.jsx";
import { getSculptureForTheme } from "../lib/themes";

// Chargement dynamique par thème : seule la sculpture active est téléchargée et montée.
const SCULPTURE_COMPONENTS = {
  mosaic: lazy(() => import("./progress/MosaicSculpture.jsx")),
  dawn: lazy(() => import("./progress/DawnSculpture.jsx")),
  starchart: lazy(() => import("./progress/StarChartSculpture.jsx")),
  bloom: lazy(() => import("./progress/BloomSculpture.jsx")),
  harmony: lazy(() => import("./progress/HarmonySculpture.jsx")),
  cairn: lazy(() => import("./progress/CairnSculpture.jsx")),
};

// Fenêtre diorama 2.5D réactive : parallaxe douce pilotée par variables CSS
// (--px / --py) via rAF sans aucun re-render React, et veille automatique en arrière-plan.
export const Gauge = React.memo(function Gauge({
  value,
  doneCount = 0,
  inProgressCount = 0,
  totalTasks = 0,
  theme = "dark",
  randomSeed = 0,
}) {
  const { t, lang } = useLang();
  const hostRef = useRef(null);
  const rafRef = useRef(0);
  const [hidden, setHidden] = useState(
    () => typeof document !== "undefined" && document.visibilityState === "hidden"
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const handlePointerMove = useCallback((e) => {
    const el = hostRef.current;
    if (!el || rafRef.current) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const nx = Math.max(-1, Math.min(1, ((clientX - rect.left) / rect.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((clientY - rect.top) / rect.height) * 2 - 1));
      el.style.setProperty("--px", nx.toFixed(3));
      el.style.setProperty("--py", ny.toFixed(3));
    });
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    const el = hostRef.current;
    if (!el) return;
    el.style.setProperty("--px", "0");
    el.style.setProperty("--py", "0");
  }, []);

  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const isComplete = totalTasks > 0 && pct >= 100;
  const sculptureId = getSculptureForTheme(theme, randomSeed);
  const ActiveSculpture = SCULPTURE_COMPONENTS[sculptureId];

  const encourageKey =
    pct === 0 || totalTasks === 0
      ? "progress_encourage_0"
      : pct < 35
        ? "progress_encourage_1"
        : pct < 70
          ? "progress_encourage_2"
          : pct < 100
            ? "progress_encourage_3"
            : "progress_encourage_4";

  const Icon = isComplete ? CheckCircle2 : pct > 0 ? Flame : Sparkles;

  return (
    <div
      ref={hostRef}
      className={
        `trk-zen-sculpture trk-zen-${sculptureId}` +
        (isComplete ? " is-complete" : "") +
        (pct === 0 ? " is-empty" : "") +
        (hidden ? " is-paused" : "")
      }
      data-sculpture={sculptureId}
      role="progressbar"
      aria-label={`${t("gauge_caption")} — ${t(`sculpture_${sculptureId}`)}`}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="trk-zen-overlay">
        <span className="trk-zen-encourage">
          <Icon size={13} className="trk-zen-spark" aria-hidden="true" />
          <span>{t(encourageKey)}</span>
        </span>
        <span className="trk-zen-stats">
          <span className="trk-zen-done">
            <AnimatedNumber value={doneOfTotal(lang, doneCount, totalTasks)} />
          </span>
          <span className="trk-zen-pct">
            <AnimatedNumber value={`${pct}%`} />
          </span>
        </span>
      </div>

      <Suspense fallback={<div className="trk-zen-skeleton" aria-hidden="true" />}>
        <ActiveSculpture
          pct={pct}
          doneCount={doneCount}
          inProgressCount={inProgressCount}
          totalTasks={totalTasks}
          isComplete={isComplete}
        />
      </Suspense>

      {/* Cadre vitré encastré (profondeur 2.5D + reflet de vitre subtil) */}
      <span className="trk-zen-window-frame" aria-hidden="true" />
    </div>
  );
});
