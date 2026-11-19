import React, { useId } from "react";

// Platine Studio 2.5D (thème Studio Graphite) :
// Double bobine magnétique aluminium (la bande se déroule de gauche à droite avec l'avancement),
// VU-mètre analogique rétroéclairé à aiguille mobile et barre de 10 LEDs encastrée.
const LED_COUNT = 10;

function TapeSpool({ cx, cy, tapeRadius, hubGrad, tapeGrad, spinning }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      {/* Ombre portée de la bobine sur la platine */}
      <circle cx="2" cy="4" r="27" fill="rgba(0, 0, 0, 0.45)" />
      {/* Flasque arrière aluminium brossé */}
      <circle cx="0" cy="0" r="26" fill={`url(#${hubGrad})`} stroke="rgba(255,255,255,0.16)" strokeWidth="0.9" />
      {/* Enroulement de bande magnétique cuivrée (rayon lié à l'avancement) */}
      <circle
        className="trk-deck-tape-coil"
        cx="0"
        cy="0"
        r="24"
        fill={`url(#${tapeGrad})`}
        style={{ transform: `scale(${(tapeRadius / 24).toFixed(3)})` }}
      />
      {/* Cercle mécanique tournant (3 ouïes aluminium de précision) */}
      <g className={"trk-deck-reel-rotor" + (spinning ? " is-spinning" : "")}>
        <circle cx="0" cy="0" r="22" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.2" />
        {[0, 120, 240].map((deg) => (
          <path
            key={deg}
            d="M-3.2,-9.5 L3.2,-9.5 L5.8,-19.5 A20,20 0 0,0 -5.8,-19.5 Z"
            fill="rgba(16, 17, 22, 0.72)"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="0.6"
            transform={`rotate(${deg})`}
          />
        ))}
        {/* Moyeu central usiné */}
        <circle cx="0" cy="0" r="8.2" fill={`url(#${hubGrad})`} stroke="rgba(255,255,255,0.34)" strokeWidth="0.9" />
        <circle cx="0" cy="0" r="3.4" fill="#18191F" stroke="rgba(245,158,11,0.55)" strokeWidth="0.8" />
        <circle cx="0" cy="-5.2" r="1" fill="rgba(255,255,255,0.5)" />
      </g>
    </g>
  );
}

export default function HarmonySculpture({ pct, inProgressCount, isComplete }) {
  const uid = useId().replace(/:/g, "");
  const ratio = pct / 100;
  const effective = isComplete ? 1 : Math.max(ratio, inProgressCount > 0 ? 0.06 : 0);
  const spinning = !isComplete && (inProgressCount > 0 || (pct > 0 && pct < 100));

  // Transfert physique de la bande : gauche (plein → vide), droite (vide → plein)
  const leftTapeR = 23.5 - effective * 11.5;
  const rightTapeR = 12 + effective * 11.5;

  // Aiguille du VU-mètre : -42° (0 %) → +42° (100 %)
  const needleAngle = -42 + effective * 84;
  const litLeds = isComplete ? LED_COUNT : Math.round(effective * LED_COUNT);

  const gBay = `deck-bay-${uid}`;
  const gHub = `deck-hub-${uid}`;
  const gTape = `deck-tape-${uid}`;
  const gVuGlow = `deck-vu-${uid}`;
  const gFloor = `deck-floor-${uid}`;

  return (
    <svg
      className={"trk-zen-svg trk-sculp-studio" + (isComplete ? " is-complete" : "")}
      viewBox="0 0 520 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gBay} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0E0F14" />
          <stop offset="65%" stopColor="#191B22" />
          <stop offset="100%" stopColor="#252731" />
        </linearGradient>
        <linearGradient id={gFloor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2A2C36" />
          <stop offset="100%" stopColor="#14151B" />
        </linearGradient>
        <linearGradient id={gHub} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#525666" />
          <stop offset="50%" stopColor="#2D303A" />
          <stop offset="100%" stopColor="#1D1F26" />
        </linearGradient>
        <radialGradient id={gTape} cx="42%" cy="38%" r="58%">
          <stop offset="0%" stopColor="#92400E" />
          <stop offset="55%" stopColor="#5C2D14" />
          <stop offset="88%" stopColor="#2E160A" />
          <stop offset="100%" stopColor="#1B0D06" />
        </radialGradient>
        <radialGradient id={gVuGlow} cx="50%" cy="80%" r="72%">
          <stop offset="0%" stopColor={isComplete ? "#34D399" : "#F59E0B"} stopOpacity={0.25 + effective * 0.4} />
          <stop offset="65%" stopColor={isComplete ? "#10B981" : "#D97706"} stopOpacity={0.08 + effective * 0.14} />
          <stop offset="100%" stopColor="#13141A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── PLAN LOINTAIN (2.5D Far) : cavité brossée & perspective de fond ── */}
      <g className="trk-depth-far">
        <rect x="-16" y="-8" width="552" height="112" fill={`url(#${gBay})`} />
        {/* Rainures acoustiques de fond en perspective */}
        <line x1="20" y1="30" x2="500" y2="30" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        <line x1="20" y1="42" x2="500" y2="42" stroke="rgba(255,255,255,0.035)" strokeWidth="1" />
        {/* Plancher de la baie en perspective trapézoïdale */}
        <polygon points="-10,98 44,78 476,78 530,98" fill={`url(#${gFloor})`} />
        <line x1="44" y1="78" x2="476" y2="78" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </g>

      {/* ── PLAN MÉDIAN (2.5D Mid) : Bobines + Ruban + Console VU-mètre ── */}
      <g className="trk-depth-mid">
        {/* Bande magnétique tendue sur les galets chromés */}
        <path
          d="M112,81 L170,84 L350,84 L408,81"
          fill="none"
          stroke="#B45309"
          strokeWidth="1.6"
          opacity="0.82"
        />
        {/* Galets de guidage chromés */}
        {[170, 350].map((gx) => (
          <g key={gx} transform={`translate(${gx} 81)`}>
            <circle cx="0.8" cy="1.6" r="4.5" fill="rgba(0,0,0,0.5)" />
            <circle cx="0" cy="0" r="4.2" fill={`url(#${gHub})`} stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
            <circle cx="0" cy="0" r="1.4" fill="#181920" />
          </g>
        ))}

        {/* Double bobine gauche & droite */}
        <TapeSpool cx={112} cy={60} tapeRadius={leftTapeR} hubGrad={gHub} tapeGrad={gTape} spinning={spinning} />
        <TapeSpool cx={408} cy={60} tapeRadius={rightTapeR} hubGrad={gHub} tapeGrad={gTape} spinning={spinning} />

        {/* Console centrale VU-mètre analogique encastré */}
        <g transform="translate(188 33)">
          {/* Ombre portée de la console sur le plancher */}
          <rect x="2" y="4" width="144" height="49" rx="9" fill="rgba(0,0,0,0.5)" />
          {/* Boîtier aluminium usiné */}
          <rect
            x="0"
            y="0"
            width="144"
            height="48"
            rx="8"
            fill="#171920"
            stroke="rgba(255,255,255,0.16)"
            strokeWidth="1"
          />
          {/* Fenêtre rétroéclairée du cadran VU */}
          <rect
            x="8"
            y="5"
            width="128"
            height="27"
            rx="5"
            fill="#101218"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="0.8"
          />
          <rect x="8" y="5" width="128" height="27" rx="5" fill={`url(#${gVuGlow})`} />

          {/* Arc gradué du VU-mètre */}
          <path
            d="M24,27 A56,56 0 0,1 120,27"
            fill="none"
            stroke="rgba(255,255,255,0.22)"
            strokeWidth="1.1"
          />
          <path
            d="M92,16.5 A56,56 0 0,1 120,27"
            fill="none"
            stroke={isComplete ? "#34D399" : "#FB7185"}
            strokeWidth="1.6"
            opacity="0.85"
          />
          {/* Graduations de précision */}
          {[-38, -24, -10, 4, 18, 32].map((deg) => (
            <line
              key={deg}
              x1="72"
              y1="10.5"
              x2="72"
              y2="13.5"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="0.9"
              transform={`rotate(${deg} 72 44)`}
            />
          ))}

          {/* Aiguille analogique (rotation GPU douce autour du pivot bas) */}
          <g
            className="trk-deck-needle"
            style={{
              transform: `rotate(${needleAngle.toFixed(1)}deg)`,
              transformOrigin: "72px 44px",
            }}
          >
            <line x1="72" y1="31" x2="72" y2="11" stroke={isComplete ? "#6EE7B7" : "#FBBF24"} strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="72" cy="11.5" r="1.4" fill="#FFFBEB" />
          </g>
          {/* Pivot mécanique bas du VU */}
          <path d="M64,32 A8,8 0 0,1 80,32 Z" fill="#272935" stroke="rgba(255,255,255,0.18)" strokeWidth="0.7" />

          {/* Reflet diagonal sur la vitre du VU */}
          <path d="M12,6 L54,6 L38,31 L12,31 Z" fill="rgba(255,255,255,0.05)" />

          {/* Rampe de 10 LEDs matérielles biseautées */}
          <g transform="translate(12 37)">
            {Array.from({ length: LED_COUNT }).map((_, i) => {
              const on = i < litLeds;
              const tone = i >= 8 ? "#34D399" : i >= 5 ? "#F59E0B" : "#FB7185";
              return (
                <rect
                  key={i}
                  className={"trk-deck-led" + (on ? " is-on" : "")}
                  x={i * 12.2}
                  y="0"
                  width="9.5"
                  height="5"
                  rx="1.6"
                  style={on ? { fill: tone } : undefined}
                />
              );
            })}
          </g>
        </g>
      </g>

      {/* ── PLAN PROCHE (2.5D Near) : rebord matériel & halo de profondeur ── */}
      <g className="trk-depth-near">
        {/* Vis usinées d'angle donnant l'effet châssis encastré */}
        {[
          [26, 86],
          [494, 86],
        ].map(([sx, sy], i) => (
          <g key={i} transform={`translate(${sx} ${sy})`} opacity="0.55">
            <circle cx="0" cy="0" r="3.2" fill="#2A2D38" stroke="rgba(255,255,255,0.22)" strokeWidth="0.6" />
            <line x1="-1.8" y1="-1.2" x2="1.8" y2="1.2" stroke="#0E0F14" strokeWidth="0.9" />
          </g>
        ))}
        {/* Légère ombre de rebord inférieur */}
        <rect x="-12" y="90" width="544" height="10" fill="rgba(0,0,0,0.38)" />
      </g>
    </svg>
  );
}
