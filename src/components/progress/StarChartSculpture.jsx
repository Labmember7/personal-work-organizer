import React, { useId, useMemo } from "react";

// Carte stellaire 2.5D (thème Nébuleuse) :
// Plan lointain (cosmos profond & micro-étoiles), plan médian (astrolabe + constellations),
// plan proche (voiles de nébuleuse volumétriques flottant DEVANT les étoiles).
const DEEP_STARS = [
  { x: 34, y: 38, r: 0.9 }, { x: 82, y: 74, r: 0.8 }, { x: 132, y: 34, r: 1.0 },
  { x: 176, y: 78, r: 0.85 }, { x: 224, y: 36, r: 0.9 }, { x: 298, y: 34, r: 0.9 },
  { x: 344, y: 79, r: 0.85 }, { x: 392, y: 35, r: 1.0 }, { x: 444, y: 76, r: 0.8 },
  { x: 488, y: 40, r: 0.9 },
];

const STARS = [
  { id: 0, x: 54, y: 60, r: 2.8, major: false },
  { id: 1, x: 102, y: 44, r: 3.8, major: true },
  { id: 2, x: 148, y: 70, r: 2.6, major: false },
  { id: 3, x: 196, y: 48, r: 4.0, major: true },
  { id: 4, x: 234, y: 72, r: 2.8, major: false },
  { id: 5, x: 260, y: 58, r: 5.2, major: true },
  { id: 6, x: 286, y: 72, r: 2.8, major: false },
  { id: 7, x: 324, y: 48, r: 4.0, major: true },
  { id: 8, x: 372, y: 70, r: 2.6, major: false },
  { id: 9, x: 418, y: 44, r: 3.8, major: true },
  { id: 10, x: 466, y: 60, r: 2.8, major: false },
];

const CONSTELLATION_LINKS = [
  [0, 1], [1, 2], [2, 3], [1, 3], [3, 4], [3, 5], [4, 5],
  [5, 6], [5, 7], [6, 7], [7, 8], [7, 9], [8, 9], [9, 10],
];

const REVEAL_ORDER = [0, 10, 1, 9, 2, 8, 3, 7, 4, 6, 5];

const VEILS = [
  { x: 76, y: 58, rx: 72, ry: 28, dir: -1, threshold: 0.14 },
  { x: 444, y: 58, rx: 72, ry: 28, dir: 1, threshold: 0.28 },
  { x: 158, y: 60, rx: 74, ry: 30, dir: -1, threshold: 0.45 },
  { x: 362, y: 60, rx: 74, ry: 30, dir: 1, threshold: 0.62 },
  { x: 222, y: 58, rx: 70, ry: 30, dir: -1, threshold: 0.78 },
  { x: 298, y: 58, rx: 70, ry: 30, dir: 1, threshold: 0.92 },
];

export default function StarChartSculpture({ pct, doneCount, inProgressCount, totalTasks, isComplete }) {
  const uid = useId().replace(/:/g, "");
  const ratio = pct / 100;

  const { revealedSet, glimmerSet } = useMemo(() => {
    const doneRatio = totalTasks > 0 ? doneCount / totalTasks : 0;
    const score = isComplete ? 1 : Math.max(doneRatio, ratio * 0.9);
    const revealedCount = isComplete
      ? STARS.length
      : Math.min(
          STARS.length - (totalTasks > 0 && doneCount < totalTasks ? 1 : 0),
          Math.round(score * STARS.length)
        );

    const revealed = new Set();
    const glimmer = new Set();
    for (let i = 0; i < STARS.length; i++) {
      const sid = REVEAL_ORDER[i];
      if (i < revealedCount) revealed.add(sid);
      else if (!isComplete && inProgressCount > 0 && i < revealedCount + 2) glimmer.add(sid);
    }
    return { revealedSet: revealed, glimmerSet: glimmer };
  }, [doneCount, inProgressCount, totalTasks, isComplete, ratio]);

  const gCosmos = `star-cosmos-${uid}`;
  const gVeil = `star-veil-${uid}`;
  const gCore = `star-core-${uid}`;

  return (
    <svg
      className={"trk-zen-svg trk-sculp-starchart" + (isComplete ? " is-complete" : "")}
      viewBox="0 0 520 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gCosmos} cx="50%" cy="56%" r="70%">
          <stop offset="0%" stopColor="#1E254D" stopOpacity={0.55 + ratio * 0.3} />
          <stop offset="60%" stopColor="#111428" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#080A16" stopOpacity="1" />
        </radialGradient>
        <radialGradient id={gVeil} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#262C52" stopOpacity="0.92" />
          <stop offset="62%" stopColor="#191D38" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#121526" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={gCore} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#E0E7FF" stopOpacity="0.92" />
          <stop offset="45%" stopColor="#818CF8" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── PLAN LOINTAIN (2.5D Far) : Cosmos profond & champ d'étoiles lointaines ── */}
      <g className="trk-depth-far">
        <rect x="-18" y="-8" width="556" height="112" fill={`url(#${gCosmos})`} />
        {DEEP_STARS.map((ds, i) => (
          <circle key={i} cx={ds.x} cy={ds.y} r={ds.r} fill="#CBD5E1" opacity="0.32" />
        ))}
        {/* Arcs célestes lointains de fond */}
        <circle cx="260" cy="60" r="78" fill="none" stroke="rgba(129,140,248,0.1)" strokeWidth="0.8" />
        <circle cx="260" cy="60" r="128" fill="none" stroke="rgba(56,189,248,0.07)" strokeWidth="0.8" />
      </g>

      {/* ── PLAN MÉDIAN (2.5D Mid) : Astrolabe sacré & constellations ── */}
      <g className="trk-depth-mid">
        <g
          className="trk-star-astrolabe"
          style={{
            opacity: (0.16 + ratio * 0.84).toFixed(3),
            transform: `translate3d(260px, 58px, 0) scale(${(0.76 + ratio * 0.24).toFixed(3)})`,
          }}
        >
          <circle className="trk-star-ring outer" cx="0" cy="0" r="28" />
          <circle className="trk-star-ring inner" cx="0" cy="0" r="17" />
          <polygon className="trk-star-diamond" points="0,-22 15,0 0,22 -15,0" />
          <circle cx="0" cy="0" r="20" fill={`url(#${gCore})`} style={{ opacity: (ratio * 0.92).toFixed(3) }} />
        </g>

        <g className="trk-star-links">
          {CONSTELLATION_LINKS.map(([a, b], idx) => {
            const sa = STARS[a];
            const sb = STARS[b];
            const lit = revealedSet.has(a) && revealedSet.has(b);
            const partial = revealedSet.has(a) || revealedSet.has(b);
            return (
              <line
                key={idx}
                className={"trk-star-link" + (lit ? " is-lit" : partial ? " is-partial" : "")}
                x1={sa.x}
                y1={sa.y}
                x2={sb.x}
                y2={sb.y}
              />
            );
          })}
        </g>

        <g className="trk-star-nodes">
          {STARS.map((st) => {
            const isLit = revealedSet.has(st.id);
            const isGlimmer = glimmerSet.has(st.id);
            return (
              <g
                key={st.id}
                className={
                  "trk-star-node" +
                  (isLit ? " is-lit" : isGlimmer ? " is-glimmer" : " is-hidden")
                }
                style={{ transform: `translate3d(${st.x}px, ${st.y}px, 0)` }}
              >
                {isLit && st.major && (
                  <circle className="trk-star-halo" cx="0" cy="0" r={st.r * 2.5} />
                )}
                {isLit && st.major ? (
                  <path
                    className="trk-star-spark"
                    d={`M0,${-st.r * 1.45} L${st.r * 0.45},${-st.r * 0.45} L${st.r * 1.45},0 L${st.r * 0.45},${st.r * 0.45} L0,${st.r * 1.45} L${-st.r * 0.45},${st.r * 0.45} L${-st.r * 1.45},0 L${-st.r * 0.45},${-st.r * 0.45} Z`}
                  />
                ) : (
                  <circle className="trk-star-dot" cx="0" cy="0" r={st.r} />
                )}
              </g>
            );
          })}
        </g>
      </g>

      {/* ── PLAN PROCHE (2.5D Near) : Nuages de nébuleuse qui se dissipent devant la carte ── */}
      <g className="trk-depth-near">
        <g className="trk-star-veils">
          {VEILS.map((v, idx) => {
            const cleared = isComplete || ratio >= v.threshold;
            const thinning = !cleared && ratio >= v.threshold - 0.16;
            const op = cleared ? 0 : thinning ? 0.42 : 0.88;
            const tx = cleared ? v.dir * 28 : thinning ? v.dir * 8 : 0;
            const sc = cleared ? 1.18 : 1;
            return (
              <ellipse
                key={idx}
                className="trk-star-veil"
                cx={v.x}
                cy={v.y}
                rx={v.rx}
                ry={v.ry}
                fill={`url(#${gVeil})`}
                style={{
                  opacity: op,
                  transform: `translate3d(${tx}px, ${cleared ? -5 : 0}px, 0) scale(${sc})`,
                  transformOrigin: `${v.x}px ${v.y}px`,
                }}
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
}
