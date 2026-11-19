import React, { useId } from "react";

// Horizon d'aube 2.5D (thème Albâtre) :
// 3 plans de parallaxe (ciel + étoiles → soleil levant + crêtes alpines → brume + crête proche).
const TWILIGHT_STARS = [
  { x: 58, y: 34, r: 1.2 },
  { x: 122, y: 29, r: 1.0 },
  { x: 184, y: 37, r: 1.3 },
  { x: 356, y: 31, r: 1.1 },
  { x: 432, y: 36, r: 1.25 },
  { x: 472, y: 30, r: 0.95 },
];

export default function DawnSculpture({ pct, inProgressCount, isComplete }) {
  const uid = useId().replace(/:/g, "");
  const ratio = pct / 100;
  const effectiveRatio = Math.max(ratio, inProgressCount > 0 ? 0.12 : 0);

  const roseOpacity = Math.min(1, effectiveRatio * 1.55);
  const goldOpacity = Math.max(0, Math.min(1, (effectiveRatio - 0.35) * 1.6));
  const starOpacity = Math.max(0, 1 - effectiveRatio * 1.9);
  const mistOpacity = Math.max(0.08, 0.8 - effectiveRatio * 0.72);

  const sunLiftY = 82 - effectiveRatio * 41;
  const sunScale = 0.78 + effectiveRatio * 0.34;
  const mistShift = effectiveRatio * 74;

  const gTwilight = `dawn-twi-${uid}`;
  const gRose = `dawn-rose-${uid}`;
  const gGold = `dawn-gold-${uid}`;
  const gSun = `dawn-sun-${uid}`;
  const gHalo = `dawn-halo-${uid}`;
  const gRidgeMid = `dawn-rmid-${uid}`;
  const gRidgeFront = `dawn-rfront-${uid}`;

  return (
    <svg
      className={"trk-zen-svg trk-sculp-dawn" + (isComplete ? " is-complete" : "")}
      viewBox="0 0 520 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gTwilight} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B4D6B" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#64748B" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={gRose} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F48E6A" stopOpacity="0.52" />
          <stop offset="55%" stopColor="#F7B787" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#818CF8" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id={gGold} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.54" />
          <stop offset="55%" stopColor="#FDE68A" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.18" />
        </linearGradient>
        <radialGradient id={gSun} cx="42%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#FFFDF5" />
          <stop offset="58%" stopColor="#FDE08D" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>
        <radialGradient id={gHalo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FBBF24" stopOpacity="0.6" />
          <stop offset="58%" stopColor="#F59E0B" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={gRidgeMid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5D9AA0" stopOpacity="0.58" />
          <stop offset="100%" stopColor="#3D6E76" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={gRidgeFront} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3B5B66" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#263B44" stopOpacity="0.88" />
        </linearGradient>
      </defs>

      {/* ── PLAN LOINTAIN (2.5D Far) : Ciel atmosphérique & étoiles du matin ── */}
      <g className="trk-depth-far">
        <rect x="-18" y="-8" width="556" height="112" fill={`url(#${gTwilight})`} />
        <rect
          className="trk-dawn-sky"
          x="-18"
          y="-8"
          width="556"
          height="112"
          fill={`url(#${gRose})`}
          style={{ opacity: roseOpacity.toFixed(3) }}
        />
        <rect
          className="trk-dawn-sky"
          x="-18"
          y="-8"
          width="556"
          height="112"
          fill={`url(#${gGold})`}
          style={{ opacity: goldOpacity.toFixed(3) }}
        />
        <g className="trk-dawn-stars" style={{ opacity: starOpacity.toFixed(3) }}>
          {TWILIGHT_STARS.map((st, i) => (
            <circle key={i} cx={st.x} cy={st.y} r={st.r} className="trk-dawn-star" />
          ))}
        </g>
        {/* Sommets lointains bleutés (brume atmosphérique) */}
        <path
          className="trk-dawn-ridge r-back"
          d="M-20,104 L-20,66 Q76,46 168,60 T342,54 T540,64 L540,104 Z"
        />
      </g>

      {/* ── PLAN MÉDIAN (2.5D Mid) : Soleil levant + crêtes médianes ── */}
      <g className="trk-depth-mid">
        <g
          className="trk-dawn-sun-group"
          style={{
            transform: `translate3d(260px, ${sunLiftY.toFixed(1)}px, 0) scale(${sunScale.toFixed(3)})`,
          }}
        >
          <circle className="trk-dawn-sun-halo" cx="0" cy="0" r="38" fill={`url(#${gHalo})`} />
          <circle className="trk-dawn-sun-core" cx="0" cy="0" r="13.5" fill={`url(#${gSun})`} />
        </g>

        <path
          d="M-20,104 L-20,76 Q104,58 214,72 T414,64 T540,74 L540,104 Z"
          fill={`url(#${gRidgeMid})`}
        />

        {/* Bancs de brume qui s'écartent de la vallée */}
        <g className="trk-dawn-mist-layer" style={{ opacity: mistOpacity.toFixed(3) }}>
          <ellipse
            className="trk-dawn-mist"
            cx="185"
            cy="74"
            rx="125"
            ry="11"
            style={{ transform: `translate3d(${(-mistShift).toFixed(1)}px, 0, 0)` }}
          />
          <ellipse
            className="trk-dawn-mist"
            cx="345"
            cy="77"
            rx="130"
            ry="12"
            style={{ transform: `translate3d(${mistShift.toFixed(1)}px, 0, 0)` }}
          />
        </g>
      </g>

      {/* ── PLAN PROCHE (2.5D Near) : Crête proche sombre encadrant la fenêtre ── */}
      <g className="trk-depth-near">
        <path
          d="M-24,104 L-24,84 Q120,74 256,84 T544,80 L544,104 Z"
          fill={`url(#${gRidgeFront})`}
        />
      </g>
    </svg>
  );
}
