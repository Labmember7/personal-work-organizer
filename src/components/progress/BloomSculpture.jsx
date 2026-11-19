import React, { useId } from "react";

// Terrarium vivant 2.5D (thème Forêt) :
// Plan lointain (canopée brumeuse + bokeh forestier), plan médian (tertre moussu + tiges + lotus),
// plan proche (mousse d'avant-plan + lucioles dorées en profondeur).
const STEMS = [
  { id: 0, x: 76, h: 34, curve: -6, threshold: 0.1, bloomAt: 0.25 },
  { id: 1, x: 138, h: 42, curve: 8, threshold: 0.2, bloomAt: 0.42 },
  { id: 2, x: 200, h: 48, curve: -7, threshold: 0.32, bloomAt: 0.56 },
  { id: 3, x: 260, h: 52, curve: 4, threshold: 0.05, bloomAt: 0.72 },
  { id: 4, x: 320, h: 47, curve: 7, threshold: 0.44, bloomAt: 0.84 },
  { id: 5, x: 382, h: 41, curve: -8, threshold: 0.58, bloomAt: 0.92 },
  { id: 6, x: 444, h: 34, curve: 6, threshold: 0.7, bloomAt: 0.98 },
];

const FIREFLIES = [
  { x: 108, y: 40, r: 2.2, at: 0.35, cls: "f1" },
  { x: 215, y: 34, r: 2.5, at: 0.52, cls: "f2" },
  { x: 305, y: 35, r: 2.3, at: 0.68, cls: "f3" },
  { x: 412, y: 42, r: 2.0, at: 0.82, cls: "f4" },
  { x: 260, y: 28, r: 2.8, at: 0.98, cls: "f5" },
];

const BOKEH = [
  { x: 96, y: 42, r: 16 },
  { x: 245, y: 36, r: 22 },
  { x: 374, y: 44, r: 18 },
];

export default function BloomSculpture({ pct, inProgressCount, isComplete }) {
  const uid = useId().replace(/:/g, "");
  const ratio = pct / 100;
  const effective = isComplete ? 1 : Math.max(ratio, inProgressCount > 0 ? 0.14 : 0);

  const gBack = `bloom-back-${uid}`;
  const gPetal = `bloom-petal-${uid}`;
  const gLeaf = `bloom-leaf-${uid}`;
  const gSoil = `bloom-soil-${uid}`;
  const gFrontMoss = `bloom-fmoss-${uid}`;

  return (
    <svg
      className={"trk-zen-svg trk-sculp-bloom" + (isComplete ? " is-complete" : "")}
      viewBox="0 0 520 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={gBack} cx="50%" cy="45%" r="72%">
          <stop offset="0%" stopColor="#1D3D32" stopOpacity={0.45 + effective * 0.35} />
          <stop offset="68%" stopColor="#111C18" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#0A110E" stopOpacity="0.96" />
        </radialGradient>
        <linearGradient id={gSoil} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#264C3F" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#12241E" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={gFrontMoss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1B382E" stopOpacity="0.82" />
          <stop offset="100%" stopColor="#0B1612" stopOpacity="0.96" />
        </linearGradient>
        <linearGradient id={gLeaf} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#059669" stopOpacity="0.62" />
          <stop offset="100%" stopColor="#6EE7B7" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={gPetal} cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#FEF9C3" />
          <stop offset="55%" stopColor="#A3E635" />
          <stop offset="100%" stopColor="#34D399" />
        </radialGradient>
      </defs>

      {/* ── PLAN LOINTAIN (2.5D Far) : Verrière forestière & bokeh lumineux ── */}
      <g className="trk-depth-far">
        <rect x="-18" y="-8" width="556" height="112" fill={`url(#${gBack})`} />
        {BOKEH.map((b, i) => (
          <circle
            key={i}
            cx={b.x}
            cy={b.y}
            r={b.r}
            fill="#34D399"
            style={{ opacity: (0.04 + effective * 0.08).toFixed(3) }}
          />
        ))}
        {/* Silhouettes douces de fougères en arrière-plan */}
        <path d="M-14,88 Q92,62 208,74 T432,68 T536,80 L536,104 L-14,104 Z" fill="rgba(22, 48, 39, 0.52)" />
      </g>

      {/* ── PLAN MÉDIAN (2.5D Mid) : Tertre moussu + 7 plantes en floraison ── */}
      <g className="trk-depth-mid">
        <path
          className="trk-bloom-ground"
          d="M-16,84 Q260,76 536,84 L536,104 L-16,104 Z"
          fill={`url(#${gSoil})`}
        />
        <path className="trk-bloom-horizon" d="M18,83 Q260,75 502,83" />

        <g className="trk-bloom-garden">
          {STEMS.map((st) => {
            const baseY = 83;
            const growth = isComplete
              ? 1
              : Math.max(0.16, Math.min(1, (effective - st.threshold + 0.25) / 0.55));
            const leafScale = Math.max(0, Math.min(1, (growth - 0.35) / 0.45));
            const isBlooming = isComplete || effective >= st.bloomAt;
            const isBudding = !isBlooming && growth >= 0.72;
            const tipY = baseY - st.h;
            const midY = baseY - st.h * 0.52;

            return (
              <g key={st.id} className="trk-bloom-plant">
                <ellipse cx={st.x} cy={baseY + 1} rx="7" ry="2" fill="rgba(0,0,0,0.34)" />
                <circle className="trk-bloom-seed" cx={st.x} cy={baseY} r="3.2" />

                <g
                  className="trk-bloom-stem-group"
                  style={{
                    transform: `scaleY(${growth.toFixed(3)})`,
                    transformOrigin: `${st.x}px ${baseY}px`,
                  }}
                >
                  <path
                    className="trk-bloom-stem"
                    d={`M${st.x},${baseY} Q${st.x + st.curve},${midY} ${st.x},${tipY}`}
                  />
                  <path
                    className="trk-bloom-leaf"
                    d={`M${st.x},${midY + 4} Q${st.x - 15},${midY - 2} ${st.x - 10},${midY - 13} Q${st.x - 2},${midY - 6} ${st.x},${midY + 4} Z`}
                    fill={`url(#${gLeaf})`}
                    style={{
                      transform: `scale(${leafScale.toFixed(3)})`,
                      transformOrigin: `${st.x}px ${midY + 4}px`,
                      opacity: leafScale.toFixed(3),
                    }}
                  />
                  <path
                    className="trk-bloom-leaf"
                    d={`M${st.x},${midY - 1} Q${st.x + 15},${midY - 7} ${st.x + 10},${midY - 18} Q${st.x + 2},${midY - 11} ${st.x},${midY - 1} Z`}
                    fill={`url(#${gLeaf})`}
                    style={{
                      transform: `scale(${leafScale.toFixed(3)})`,
                      transformOrigin: `${st.x}px ${midY - 1}px`,
                      opacity: leafScale.toFixed(3),
                    }}
                  />
                </g>

                <g
                  className={
                    "trk-bloom-crown" +
                    (isBlooming ? " is-open" : isBudding ? " is-bud" : " is-dormant")
                  }
                  style={{
                    transform: `translate3d(${st.x}px, ${(baseY - st.h * growth).toFixed(1)}px, 0) scale(${isBlooming ? 1 : isBudding ? 0.55 : 0.25})`,
                  }}
                >
                  <ellipse className="trk-bloom-petal p-l" cx="-5.2" cy="-1" rx="5.8" ry="3.2" transform="rotate(-28 -5.2 -1)" fill={`url(#${gPetal})`} />
                  <ellipse className="trk-bloom-petal p-r" cx="5.2" cy="-1" rx="5.8" ry="3.2" transform="rotate(28 5.2 -1)" fill={`url(#${gPetal})`} />
                  <ellipse className="trk-bloom-petal p-c" cx="0" cy="-4.2" rx="3.6" ry="6.5" fill={`url(#${gPetal})`} />
                  <circle className="trk-bloom-core" cx="0" cy="-2" r="2.3" />
                </g>
              </g>
            );
          })}
        </g>
      </g>

      {/* ── PLAN PROCHE (2.5D Near) : Mousse d'avant-plan & lucioles proches ── */}
      <g className="trk-depth-near">
        <path
          d="M-24,104 L-24,90 Q110,83 255,91 T544,87 L544,104 Z"
          fill={`url(#${gFrontMoss})`}
        />
        <g className="trk-bloom-fireflies">
          {FIREFLIES.map((f, idx) => {
            const visible = isComplete || effective >= f.at;
            return (
              <circle
                key={idx}
                className={`trk-bloom-firefly ${f.cls}` + (visible ? " is-lit" : "")}
                cx={f.x}
                cy={f.y}
                r={f.r}
              />
            );
          })}
        </g>
      </g>
    </svg>
  );
}
