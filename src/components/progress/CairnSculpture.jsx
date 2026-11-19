import React, { useId, useMemo } from "react";

// Jardin de Pierres Zen 2.5D (thème Sable Zen) :
// Pierres de rivière organiques, rondes et asymétriques (sculptées par courbes Bézier,
// zéro ovales génériques) avec éclairage volumétrique directionnel, ombres portées
// d'occlusion et sable karesansui en perspective.

// Chaque pierre est définie autour de son propre centre (0, 0) par un contour organique
// asymétrique (galet de rivière poli par l'eau), une position cible (x, y), et une teinte minérale.
const STONES = [
  // 0 : Large rocher de socle central (basalte ardoise arrondi et robuste)
  {
    id: 0,
    x: 262,
    y: 77,
    rot: 0,
    tone: "basalt",
    shadowRx: 34,
    shadowY: 9,
    d: "M-34,4 C-36,-4 -26,-11 -8,-12 C12,-13 31,-8 35,1 C37,7 27,11 4,11 C-20,11 -32,9 -34,4 Z",
    hl: "M-22,-5 C-12,-9 4,-9 16,-6 C8,-4 -8,-3 -22,-5 Z",
    rim: "M-25,8 C-6,10 14,10 26,7",
  },
  // 1 : Galet ventru terracotta (rond, chaleureux, légèrement asymétrique)
  {
    id: 1,
    x: 259,
    y: 62,
    rot: -2,
    tone: "clay",
    shadowRx: 23,
    shadowY: 8.5,
    d: "M-24,2 C-26,-6 -16,-12 1,-12 C17,-12 26,-6 24,3 C22,9 12,10 -2,10 C-16,10 -22,7 -24,2 Z",
    hl: "M-15,-5 C-7,-9 5,-9 12,-5 C4,-3 -8,-3 -15,-5 Z",
    rim: "M-16,8 C-4,9.5 9,9 17,7",
  },
  // 2 : Galet d'appoint gauche (socle grès clair bombé)
  {
    id: 2,
    x: 158,
    y: 79,
    rot: 1.5,
    tone: "sandstone",
    shadowRx: 25,
    shadowY: 8,
    d: "M-25,3 C-27,-5 -17,-11 -1,-10 C15,-10 26,-4 25,3 C24,8 14,10 -2,10 C-17,10 -24,8 -25,3 Z",
    hl: "M-16,-4 C-8,-8 5,-7 12,-4 C4,-2 -8,-2 -16,-4 Z",
    rim: "M-18,8 C-5,9 10,9 18,7",
  },
  // 3 : Galet rond moyen central (pierre grise-sauge bien rebondie)
  {
    id: 3,
    x: 263,
    y: 49,
    rot: 2.5,
    tone: "moss",
    shadowRx: 17,
    shadowY: 7.5,
    d: "M-18,1 C-19,-6 -11,-11 1,-10 C13,-10 19,-4 17,3 C15,8 7,9 -3,9 C-13,9 -17,6 -18,1 Z",
    hl: "M-11,-4 C-4,-8 5,-7 9,-4 C3,-2 -5,-2 -11,-4 Z",
    rim: "M-12,7 C-3,8.2 7,8 12,6.5",
  },
  // 4 : Pierre ronde sur la pile gauche (galet bronze poli)
  {
    id: 4,
    x: 160,
    y: 66,
    rot: -3,
    tone: "bronze",
    shadowRx: 14,
    shadowY: 7,
    d: "M-15,1 C-16,-6 -9,-10 1,-9 C11,-9 16,-4 14,3 C13,7.5 6,8.5 -2,8.5 C-10,8.5 -14,6 -15,1 Z",
    hl: "M-9,-4 C-3,-7 4,-6 7,-3 C2,-1.5 -5,-1.5 -9,-4 Z",
    rim: "M-10,6.5 C-2,7.5 6,7.5 10,6",
  },
  // 5 : Rocher rond à droite (basalte doux ancré dans le sable)
  {
    id: 5,
    x: 368,
    y: 78,
    rot: -1,
    tone: "basalt",
    shadowRx: 24,
    shadowY: 8.5,
    d: "M-23,3 C-25,-5 -15,-12 0,-11 C15,-11 25,-4 23,4 C21,9 12,10 -2,10 C-15,10 -22,8 -23,3 Z",
    hl: "M-14,-5 C-6,-8.5 5,-8 12,-4.5 C4,-2.5 -7,-2.5 -14,-5 Z",
    rim: "M-16,8 C-4,9.2 9,9 16,7.2",
  },
  // 6 : Petit galet rond terracotta posé sur le rocher droit
  {
    id: 6,
    x: 365,
    y: 65,
    rot: 3,
    tone: "clay",
    shadowRx: 13,
    shadowY: 6.5,
    d: "M-13,1 C-14,-5 -8,-9 1,-9 C10,-9 14,-3 12,3 C11,7 5,8 -2,8 C-9,8 -12,5.5 -13,1 Z",
    hl: "M-8,-4 C-3,-6.5 3,-6 6,-3.5 C1.5,-2 -4,-2 -8,-4 Z",
    rim: "M-8,6 C-2,7 5,7 8,5.5",
  },
  // 7 : Galet supérieur quasi-sphérique du cairn central (grès chaud)
  {
    id: 7,
    x: 260,
    y: 38,
    rot: -1.5,
    tone: "sandstone",
    shadowRx: 11.5,
    shadowY: 6,
    d: "M-12,1 C-13,-5 -7,-9 0,-8.5 C8,-8.5 13,-4 11.5,2.5 C10,6.5 5,7.5 -2,7.5 C-8,7.5 -11,5 -12,1 Z",
    hl: "M-7,-3.5 C-2.5,-6 3,-5.5 5.5,-3 C1.5,-1.5 -3.5,-1.5 -7,-3.5 Z",
    rim: "M-7,5.5 C-1.5,6.5 4.5,6.3 7.5,5",
  },
  // 8 : Pierre faîtière ronde en quartz doré (couronnement à 100 %)
  {
    id: 8,
    x: 261,
    y: 28,
    rot: 0,
    tone: "quartz",
    shadowRx: 7.5,
    shadowY: 5,
    d: "M-7.5,0.5 C-8,-4.5 -4,-7.5 0.5,-7.5 C5.5,-7.5 8.5,-3.5 7.5,1.5 C6.5,5 3,6 -1,6 C-5,6 -7,4 -7.5,0.5 Z",
    hl: "M-4.5,-3 C-1.5,-5 2,-4.5 3.5,-2.5 C1,-1.5 -2,-1.5 -4.5,-3 Z",
    rim: "M-4.5,4.2 C-1,5 2.5,5 4.8,3.8",
  },
];

export default function CairnSculpture({ pct, doneCount, inProgressCount, totalTasks, isComplete }) {
  const uid = useId().replace(/:/g, "");
  const total = STONES.length;

  const { placedCount, hoveringIndex } = useMemo(() => {
    const ratio = pct / 100;
    const doneRatio = totalTasks > 0 ? doneCount / totalTasks : 0;
    const placed = isComplete
      ? total
      : Math.min(
          total - (totalTasks > 0 && doneCount < totalTasks ? 1 : 0),
          Math.round(Math.max(doneRatio, ratio * 0.85) * total)
        );
    const hovering =
      !isComplete && (inProgressCount > 0 || (pct > 0 && placed === 0)) && placed < total
        ? placed
        : -1;
    return { placedCount: placed, hoveringIndex: hovering };
  }, [pct, doneCount, inProgressCount, totalTasks, isComplete, total]);

  const gBackdrop = `cairn-bg-${uid}`;
  const gSandFloor = `cairn-floor-${uid}`;
  const gBasalt = `cairn-basalt-${uid}`;
  const gClay = `cairn-clay-${uid}`;
  const gSandstone = `cairn-sandstone-${uid}`;
  const gMoss = `cairn-moss-${uid}`;
  const gBronze = `cairn-bronze-${uid}`;
  const gQuartz = `cairn-quartz-${uid}`;

  const toneUrl = (tone) => {
    switch (tone) {
      case "basalt": return `url(#${gBasalt})`;
      case "clay": return `url(#${gClay})`;
      case "sandstone": return `url(#${gSandstone})`;
      case "moss": return `url(#${gMoss})`;
      case "bronze": return `url(#${gBronze})`;
      default: return `url(#${gQuartz})`;
    }
  };

  return (
    <svg
      className={"trk-zen-svg trk-sculp-cairn" + (isComplete ? " is-complete" : "")}
      viewBox="0 0 520 96"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        {/* Lumière douce d'un jardin zen à travers un shoji */}
        <linearGradient id={gBackdrop} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DDD5C5" stopOpacity="0.52" />
          <stop offset="65%" stopColor="#EDE7DC" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#E4DCCB" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id={gSandFloor} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E2D9C8" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#D3C7B2" stopOpacity="0.92" />
        </linearGradient>

        {/* Dégradés radiaux 3D excentrés (lumière zénithale haut-gauche → ombre noyau bas-droite) */}
        <radialGradient id={gBasalt} cx="32%" cy="26%" r="72%">
          <stop offset="0%" stopColor="#9A948A" />
          <stop offset="42%" stopColor="#6B655D" />
          <stop offset="82%" stopColor="#433F39" />
          <stop offset="100%" stopColor="#5E574E" />
        </radialGradient>
        <radialGradient id={gClay} cx="32%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#E69B7B" />
          <stop offset="44%" stopColor="#C46A48" />
          <stop offset="84%" stopColor="#863F26" />
          <stop offset="100%" stopColor="#A65A3D" />
        </radialGradient>
        <radialGradient id={gSandstone} cx="33%" cy="26%" r="72%">
          <stop offset="0%" stopColor="#EAE0CF" />
          <stop offset="46%" stopColor="#C6B79F" />
          <stop offset="84%" stopColor="#8E7F69" />
          <stop offset="100%" stopColor="#AEA08B" />
        </radialGradient>
        <radialGradient id={gMoss} cx="33%" cy="25%" r="72%">
          <stop offset="0%" stopColor="#A9B4A4" />
          <stop offset="45%" stopColor="#778473" />
          <stop offset="84%" stopColor="#4B5648" />
          <stop offset="100%" stopColor="#657061" />
        </radialGradient>
        <radialGradient id={gBronze} cx="32%" cy="26%" r="72%">
          <stop offset="0%" stopColor="#DEC08A" />
          <stop offset="46%" stopColor="#B68E51" />
          <stop offset="85%" stopColor="#7A5A2B" />
          <stop offset="100%" stopColor="#9B7743" />
        </radialGradient>
        <radialGradient id={gQuartz} cx="34%" cy="26%" r="70%">
          <stop offset="0%" stopColor="#FFFBEB" />
          <stop offset="45%" stopColor="#F5CA68" />
          <stop offset="84%" stopColor="#B97B24" />
          <stop offset="100%" stopColor="#DDA648" />
        </radialGradient>
      </defs>

      {/* ── PLAN LOINTAIN (2.5D Far) : mur shoji & collines lointaines ── */}
      <g className="trk-depth-far">
        <rect x="-16" y="-8" width="552" height="112" fill={`url(#${gBackdrop})`} />
        {/* Collines brumeuses très douces au loin */}
        <path
          d="M-16,66 Q95,46 215,58 T430,52 T540,62 L540,104 L-16,104 Z"
          fill="rgba(160, 146, 126, 0.16)"
        />
        {/* Tiges de bambou très pâles en fond à gauche/droite */}
        <line x1="56" y1="22" x2="52" y2="72" stroke="rgba(122, 114, 98, 0.14)" strokeWidth="2.2" />
        <line x1="66" y1="30" x2="64" y2="72" stroke="rgba(122, 114, 98, 0.1)" strokeWidth="1.5" />
        <line x1="468" y1="24" x2="472" y2="72" stroke="rgba(122, 114, 98, 0.13)" strokeWidth="2" />
      </g>

      {/* ── PLAN MÉDIAN (2.5D Mid) : Sol de sable ratissé en perspective + Cairn 3D ── */}
      <g className="trk-depth-mid">
        {/* Plateau de sable karesansui */}
        <path d="M-16,71 Q260,64 536,71 L536,102 L-16,102 Z" fill={`url(#${gSandFloor})`} />
        {/* Sillages de sable ratissé avec crête claire + creux ombré */}
        <g className="trk-cairn-sand-lines">
          <path className="trk-cairn-groove-hi" d="M12,75 Q260,69 508,75" />
          <path className="trk-cairn-groove" d="M12,76.3 Q260,70.3 508,76.3" />
          <path className="trk-cairn-groove-hi" d="M36,81.5 Q260,76.5 484,81.5" />
          <path className="trk-cairn-groove" d="M36,82.8 Q260,77.8 484,82.8" />
          <ellipse className="trk-cairn-ripple" cx="262" cy="83" rx="64" ry="6" />
          <ellipse className="trk-cairn-ripple" cx="158" cy="84" rx="40" ry="4.5" />
          <ellipse className="trk-cairn-ripple" cx="368" cy="84" rx="38" ry="4.5" />
        </g>

        {/* Pierres organiques 3D empilées */}
        <g className="trk-cairn-stones">
          {STONES.map((st, idx) => {
            const isPlaced = idx < placedCount;
            const isHovering = idx === hoveringIndex;
            const dropY = isPlaced ? 0 : isHovering ? -6 : -13;
            const op = isPlaced ? 1 : isHovering ? 0.78 : 0.2;
            return (
              <g
                key={st.id}
                className={
                  "trk-cairn-stone" +
                  (isPlaced ? " is-placed" : isHovering ? " is-hovering" : " is-ghost")
                }
                style={{
                  transform: `translate3d(${st.x}px, ${(st.y + dropY).toFixed(1)}px, 0) rotate(${st.rot}deg)`,
                  opacity: op,
                }}
              >
                {/* Ombre d'occlusion douce sous la pierre posée */}
                {isPlaced && (
                  <ellipse
                    className="trk-cairn-shadow"
                    cx="2"
                    cy={st.shadowY}
                    rx={st.shadowRx}
                    ry="3.2"
                  />
                )}
                {/* Corps volumétrique de la pierre */}
                <path
                  className="trk-cairn-pebble"
                  d={st.d}
                  style={isPlaced || isHovering ? { fill: toneUrl(st.tone) } : undefined}
                />
                {/* Reflet zénithal supérieur doux */}
                {(isPlaced || isHovering) && (
                  <>
                    <path className="trk-cairn-highlight" d={st.hl} />
                    {/* Lumière réfléchie par le sable sous la pierre (bounce light 3D) */}
                    <path className="trk-cairn-rim" d={st.rim} />
                  </>
                )}
              </g>
            );
          })}
        </g>
      </g>

      {/* ── PLAN PROCHE (2.5D Near) : rebord de sable proche & boiserie engawa ── */}
      <g className="trk-depth-near">
        <path
          d="M-16,90 Q130,85 260,89 T536,88 L536,104 L-16,104 Z"
          fill="rgba(130, 114, 92, 0.22)"
        />
        <line x1="-12" y1="93" x2="532" y2="93" stroke="rgba(72, 58, 42, 0.26)" strokeWidth="2.5" />
      </g>
    </svg>
  );
}
