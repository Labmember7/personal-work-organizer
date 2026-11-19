import React, { useId, useMemo } from "react";

// Fresque Kintsugi 2.5D en vitrine d'obsidienne :
// Plan lointain (paroi d'obsidienne encastrée + halo doré), plan médian (14 éclats
// céramiques biseautés avec ombres portées et soudures d'or), plan proche (poussière d'or).
const SHARDS = [
  { id: 0, pts: "28,36 76,32 68,60 26,58", cx: 50, cy: 47, tone: "a" },
  { id: 1, pts: "26,58 68,60 60,84 28,82", cx: 46, cy: 71, tone: "b" },
  { id: 2, pts: "76,32 136,34 122,62 68,60", cx: 100, cy: 47, tone: "c" },
  { id: 3, pts: "68,60 122,62 134,84 60,84", cx: 96, cy: 72, tone: "a" },
  { id: 4, pts: "136,34 204,32 192,60 122,62", cx: 164, cy: 47, tone: "b" },
  { id: 5, pts: "122,62 192,60 208,84 134,84", cx: 164, cy: 72, tone: "c" },
  { id: 6, pts: "204,32 274,34 264,62 192,60", cx: 233, cy: 47, tone: "a" },
  { id: 7, pts: "192,60 264,62 278,84 208,84", cx: 235, cy: 72, tone: "b" },
  { id: 8, pts: "274,34 348,32 338,60 264,62", cx: 306, cy: 47, tone: "c" },
  { id: 9, pts: "264,62 338,60 352,84 278,84", cx: 308, cy: 72, tone: "a" },
  { id: 10, pts: "348,32 424,34 412,62 338,60", cx: 380, cy: 47, tone: "b" },
  { id: 11, pts: "338,60 412,62 426,84 352,84", cx: 382, cy: 72, tone: "c" },
  { id: 12, pts: "424,34 494,36 492,60 412,62", cx: 455, cy: 48, tone: "a" },
  { id: 13, pts: "412,62 492,60 494,82 426,84", cx: 456, cy: 72, tone: "b" },
];

const SEAMS = [
  { x1: 68, y1: 60, x2: 26, y2: 58, a: 0, b: 1 },
  { x1: 76, y1: 32, x2: 68, y2: 60, a: 0, b: 2 },
  { x1: 68, y1: 60, x2: 60, y2: 84, a: 1, b: 3 },
  { x1: 68, y1: 60, x2: 122, y2: 62, a: 2, b: 3 },
  { x1: 136, y1: 34, x2: 122, y2: 62, a: 2, b: 4 },
  { x1: 122, y1: 62, x2: 134, y2: 84, a: 3, b: 5 },
  { x1: 122, y1: 62, x2: 192, y2: 60, a: 4, b: 5 },
  { x1: 204, y1: 32, x2: 192, y2: 60, a: 4, b: 6 },
  { x1: 192, y1: 60, x2: 208, y2: 84, a: 5, b: 7 },
  { x1: 192, y1: 60, x2: 264, y2: 62, a: 6, b: 7 },
  { x1: 274, y1: 34, x2: 264, y2: 62, a: 6, b: 8 },
  { x1: 264, y1: 62, x2: 278, y2: 84, a: 7, b: 9 },
  { x1: 264, y1: 62, x2: 338, y2: 60, a: 8, b: 9 },
  { x1: 348, y1: 32, x2: 338, y2: 60, a: 8, b: 10 },
  { x1: 338, y1: 60, x2: 352, y2: 84, a: 9, b: 11 },
  { x1: 338, y1: 60, x2: 412, y2: 62, a: 10, b: 11 },
  { x1: 424, y1: 34, x2: 412, y2: 62, a: 10, b: 12 },
  { x1: 412, y1: 62, x2: 426, y2: 84, a: 11, b: 13 },
  { x1: 412, y1: 62, x2: 492, y2: 60, a: 12, b: 13 },
];

const FILL_ORDER = [0, 3, 2, 1, 4, 7, 6, 5, 8, 11, 10, 9, 12, 13];

const GOLD_MOTES = [
  { x: 92, y: 40, r: 1.3 },
  { x: 185, y: 76, r: 1.5 },
  { x: 288, y: 42, r: 1.2 },
  { x: 376, y: 74, r: 1.4 },
  { x: 446, y: 44, r: 1.1 },
];

export default function MosaicSculpture({ pct, doneCount, inProgressCount, totalTasks, isComplete }) {
  const uid = useId().replace(/:/g, "");
  const total = SHARDS.length;
  const ratio = pct / 100;

  const { litSet, warmSet, magneticSet } = useMemo(() => {
    const doneRatio = totalTasks > 0 ? doneCount / totalTasks : 0;
    const litCount = isComplete
      ? total
      : Math.min(
          total - (totalTasks > 0 && doneCount < totalTasks ? 1 : 0),
          Math.round(Math.max(doneRatio, ratio * 0.85) * total)
        );
    const extraWarm =
      !isComplete && (inProgressCount > 0 || (pct > 0 && litCount === 0))
        ? Math.max(1, Math.min(3, Math.ceil((inProgressCount / Math.max(1, totalTasks)) * 4)))
        : 0;

    const lit = new Set();
    const warm = new Set();
    const magnetic = new Set();

    for (let i = 0; i < total; i++) {
      const shardId = FILL_ORDER[i];
      if (i < litCount) lit.add(shardId);
      else if (i < litCount + extraWarm) warm.add(shardId);
    }

    const remaining = total - lit.size;
    if (!isComplete && remaining > 0 && remaining <= 3 && lit.size > 0) {
      for (let i = litCount; i < total; i++) {
        magnetic.add(FILL_ORDER[i]);
      }
    }

    return { litSet: lit, warmSet: warm, magneticSet: magnetic };
  }, [pct, doneCount, inProgressCount, totalTasks, isComplete, total, ratio]);

  const gBack = `mosaic-back-${uid}`;
  const gA = `mosaic-a-${uid}`;
  const gB = `mosaic-b-${uid}`;
  const gC = `mosaic-c-${uid}`;
  const gGold = `mosaic-gold-${uid}`;

  return (
    <svg
      className="trk-zen-svg trk-sculp-mosaic"
      viewBox="0 0 520 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gBack} cx="50%" cy="62%" r="68%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.14 + ratio * 0.14} />
          <stop offset="62%" stopColor="#12161E" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#090C11" stopOpacity="0.92" />
        </radialGradient>
        <linearGradient id={gA} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4BC8C0" stopOpacity="0.72" />
          <stop offset="52%" stopColor="#267F7B" stopOpacity="0.54" />
          <stop offset="100%" stopColor="#133D40" stopOpacity="0.78" />
        </linearGradient>
        <linearGradient id={gB} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#F3CE84" stopOpacity="0.62" />
          <stop offset="55%" stopColor="#8C7449" stopOpacity="0.46" />
          <stop offset="100%" stopColor="#1F2E36" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={gC} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#58C48B" stopOpacity="0.62" />
          <stop offset="55%" stopColor="#29695B" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#122B2B" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={gGold} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#C99238" />
          <stop offset="50%" stopColor="#FFF0BA" />
          <stop offset="100%" stopColor="#C99238" />
        </linearGradient>
      </defs>

      {/* ── PLAN LOINTAIN (2.5D Far) : Niche d'obsidienne rétroéclairée ── */}
      <g className="trk-depth-far">
        <rect x="-16" y="-8" width="552" height="112" fill={`url(#${gBack})`} />
        {/* Rebord de socle profond sous la fresque */}
        <polygon points="-10,98 26,84 494,84 530,98" fill="rgba(0, 0, 0, 0.35)" />
      </g>

      {/* ── PLAN MÉDIAN (2.5D Mid) : Éclats céramiques en relief + ombres + soudures d'or ── */}
      <g className="trk-depth-mid">
        <g className="trk-mosaic-shards">
          {SHARDS.map((s) => {
            const isLit = litSet.has(s.id);
            const isWarm = warmSet.has(s.id);
            const isMag = magneticSet.has(s.id);
            const fillId = s.tone === "a" ? gA : s.tone === "b" ? gB : gC;

            return (
              <g
                key={s.id}
                className={
                  "trk-mosaic-shard" +
                  (isLit ? " is-lit" : isWarm ? " is-warm" : " is-ghost") +
                  (isMag ? " is-magnetic" : "")
                }
                style={{ transformOrigin: `${s.cx}px ${s.cy}px` }}
              >
                {/* Ombre portée de profondeur derrière chaque éclat encastré */}
                {isLit && (
                  <polygon
                    points={s.pts}
                    fill="rgba(0, 0, 0, 0.48)"
                    transform="translate(2.2 3.2)"
                  />
                )}
                <polygon
                  className="trk-mosaic-poly"
                  points={s.pts}
                  style={isLit ? { fill: `url(#${fillId})` } : undefined}
                />
              </g>
            );
          })}
        </g>

        <g className="trk-mosaic-seams">
          {SEAMS.map((sm, idx) => {
            const bothLit = litSet.has(sm.a) && litSet.has(sm.b);
            const oneLit = litSet.has(sm.a) || litSet.has(sm.b);
            return (
              <line
                key={idx}
                className={
                  "trk-mosaic-seam" +
                  (bothLit ? " is-gold" : oneLit ? " is-edge" : "")
                }
                x1={sm.x1}
                y1={sm.y1}
                x2={sm.x2}
                y2={sm.y2}
                style={bothLit ? { stroke: `url(#${gGold})` } : undefined}
              />
            );
          })}
        </g>

        {isComplete && <rect className="trk-mosaic-sheen" x="-80" y="28" width="120" height="62" />}
      </g>

      {/* ── PLAN PROCHE (2.5D Near) : poussière d'or flottante & vignette basse ── */}
      <g className="trk-depth-near">
        {GOLD_MOTES.map((m, idx) => (
          <circle
            key={idx}
            cx={m.x}
            cy={m.y}
            r={m.r}
            fill="#FDE68A"
            style={{ opacity: (ratio * 0.55).toFixed(2) }}
          />
        ))}
        <rect x="-16" y="88" width="552" height="12" fill="rgba(0, 0, 0, 0.25)" />
      </g>
    </svg>
  );
}
