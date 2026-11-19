// Moteur partagé de rendu tête & animations de caractère procédurales.
// Garantit une parité visuelle et chromatique exacte entre l'avatar de la
// Dynamic Island (PixelHelper) et le compagnon minimisé (FullBodyPet).

export const QUIRK_DURATIONS = {
  sparkle_hop: 1650,
  plasma_surge: 1750,
  matrix_scan: 1850,
  star_orbit: 2000,
  curious_tilt: 1700,
  rune_pulse: 1900,
};

const PERSONALITY_QUIRK_MAP = {
  "Curious & Sub-Pixel Sharp": "curious_tilt",
  "Quiet Guardian of Focus": "rune_pulse",
  "Hyperactive & Cheerful": "plasma_surge",
  "Analytical Neural Sync": "matrix_scan",
  "Cosmic Dreamer & Drifter": "star_orbit",
  "Playful Code Companion": "sparkle_hop",
};

const ARCHETYPE_QUIRK_MAP = {
  "Neural Sentinel": "matrix_scan",
  "Chrono Familiar": "matrix_scan",
  "Cyber Fox": "curious_tilt",
  "Sub-Pixel Sylph": "curious_tilt",
  "Quantum Sprite": "star_orbit",
  "Star Voyager": "star_orbit",
  "Aether Bot": "star_orbit",
  "Plasma Scout": "plasma_surge",
  "Hyper Familiar": "plasma_surge",
  "Neon Golem": "rune_pulse",
  "Pulse Druid": "rune_pulse",
  "Glitch Kitten": "sparkle_hop",
};

const ALL_QUIRKS = Object.keys(QUIRK_DURATIONS);

export function resolveSignatureQuirk(petDna) {
  if (petDna?.personality && PERSONALITY_QUIRK_MAP[petDna.personality]) {
    return PERSONALITY_QUIRK_MAP[petDna.personality];
  }
  if (petDna?.archetype && ARCHETYPE_QUIRK_MAP[petDna.archetype]) {
    return ARCHETYPE_QUIRK_MAP[petDna.archetype];
  }
  if (petDna?.antennaType === "cat_ears") return "sparkle_hop";
  if (petDna?.antennaType === "halo_ring") return "star_orbit";
  if (petDna?.antennaType === "cyber_horns") return "plasma_surge";
  return "curious_tilt";
}

export function pickNextQuirk(petDna, lastQuirk = null) {
  const signature = resolveSignatureQuirk(petDna);
  const pool = ALL_QUIRKS.filter((q) => q !== signature);
  let chosen = signature;

  if (Math.random() > 0.62 || lastQuirk === signature) {
    const secondary =
      petDna?.archetype && ARCHETYPE_QUIRK_MAP[petDna.archetype]
        ? ARCHETYPE_QUIRK_MAP[petDna.archetype]
        : pool[Math.floor(Math.random() * pool.length)];
    if (secondary !== lastQuirk) {
      chosen = secondary;
    } else {
      const alternatives = ALL_QUIRKS.filter((q) => q !== lastQuirk);
      chosen = alternatives[Math.floor(Math.random() * alternatives.length)];
    }
  }

  return {
    type: chosen,
    duration: QUIRK_DURATIONS[chosen] || 1700,
  };
}

export function resolveHeadPalette(petDna) {
  const pal = petDna?.palette || {};
  return {
    chassisDark: pal.chassisDark || "#060C18",
    chassisMid: pal.chassisMid || "#0E1A2E",
    chassisLight: pal.chassisLight || "#1A2E4D",
    rim: pal.rim || "#93C5FD",
    neon: pal.neon || "#00F5D4",
    glow: pal.glow || "#5EEAD4",
    visorBg: "#03060C",
    pupil: pal.pupil || "#002B36",
    antenna: pal.antenna || "#FF2E93",
    cheek: pal.cheek || "#FF3385",
    accentLight: pal.accentLight || "#38BDF8",
    accentDark: pal.accentDark || "#0284C7",
  };
}

/**
 * Dessine la tête complète 36×27 alignée sur le repère (ox, oy).
 * Utilisé à l'identique par PixelHelper (36×36, ox=0, oy=0) et
 * FullBodyPet (52×64, ox=8, oy=baseY) pour une parité visuelle totale.
 */
export function drawPetHead(px, fillBox, ox, oy, petDna, opts) {
  const {
    time = 0,
    currentMood = "normal",
    isHovered = false,
    blinkProgress = 0,
    eyeX = 0,
    eyeY = 0,
    scanPos = 0,
    munchFrame = 0,
    activeQuirk = null,
    quirkProgress = 0,
    reduceMotion = false,
    palette = null,
  } = opts;

  const c = palette || resolveHeadPalette(petDna);
  const antennaType = petDna?.antennaType || "pulse_beacon";
  const earType = petDna?.earType || "equalizer";
  const eyeShape = petDna?.eyeShape || "classic_square";

  const earTwitch =
    !reduceMotion && activeQuirk === "sparkle_hop" && Math.sin(quirkProgress * Math.PI * 4) > 0.3
      ? -1
      : 0;

  // ── A. Antenne / Coiffe Symétrique ──
  if (antennaType === "cat_ears") {
    fillBox(ox + 9, oy + 4 + earTwitch, 3, 4, c.chassisMid);
    fillBox(ox + 10, oy + 3 + earTwitch, 2, 2, c.chassisLight);
    px(ox + 10, oy + 2 + earTwitch, c.rim);
    fillBox(ox + 10, oy + 5 + earTwitch, 1, 2, c.antenna);

    fillBox(ox + 24, oy + 4, 3, 4, c.chassisMid);
    fillBox(ox + 24, oy + 3, 2, 2, c.chassisLight);
    px(ox + 25, oy + 2, c.rim);
    fillBox(ox + 25, oy + 5, 1, 2, c.antenna);
  } else if (antennaType === "cyber_horns") {
    fillBox(ox + 11, oy + 4, 2, 4, c.chassisLight);
    fillBox(ox + 10, oy + 2, 2, 3, c.antenna);
    px(ox + 9, oy + 2, c.rim);

    fillBox(ox + 23, oy + 4, 2, 4, c.chassisLight);
    fillBox(ox + 24, oy + 2, 2, 3, c.antenna);
    px(ox + 26, oy + 2, c.rim);
  } else if (antennaType === "halo_ring") {
    const haloBoost = activeQuirk === "star_orbit" ? -1 : 0;
    const haloY = reduceMotion ? 0 : Math.sin(time * 0.003) * 0.6 + haloBoost;
    const hy = Math.round(oy + 3 + haloY);
    fillBox(ox + 12, hy, 12, 1, c.neon);
    px(ox + 11, hy + 1, c.antenna);
    px(ox + 24, hy + 1, c.antenna);
    fillBox(ox + 13, hy - 1, 10, 1, "rgba(255, 255, 255, 0.35)");
  } else if (antennaType === "dual_antennae") {
    const glowAlpha = reduceMotion ? 0.85 : Math.sin(time * 0.004) * 0.2 + 0.8;
    fillBox(ox + 13, oy + 3 + earTwitch, 1, 5, "#475569");
    px(ox + 13, oy + 2 + earTwitch, c.antenna);
    px(ox + 13, oy + 1 + earTwitch, `rgba(255, 255, 255, ${glowAlpha})`);

    fillBox(ox + 22, oy + 3, 1, 5, "#475569");
    px(ox + 22, oy + 2, c.antenna);
    px(ox + 22, oy + 1, `rgba(255, 255, 255, ${glowAlpha})`);
  } else {
    const pulseAlpha =
      activeQuirk === "plasma_surge" || activeQuirk === "rune_pulse"
        ? 1
        : reduceMotion
          ? 0.85
          : Math.sin(time * 0.004) * 0.2 + 0.8;
    fillBox(ox + 17, oy + 3, 2, 2, c.antenna);
    px(ox + 17, oy + 2, `rgba(255, 255, 255, ${pulseAlpha})`);
    fillBox(ox + 17, oy + 5, 2, 3, "#334155");
    fillBox(ox + 16, oy + 7, 4, 1, "#475569");
  }

  // ── B. Modules Latéraux Symétriques ──
  if (earType === "cyber_wings") {
    fillBox(ox + 4, oy + 15, 3, 4, c.chassisLight);
    fillBox(ox + 3, oy + 14, 2, 2, c.neon);
    px(ox + 2, oy + 13, c.rim);
    fillBox(ox + 5, oy + 19, 2, 2, c.accentDark);

    fillBox(ox + 29, oy + 15, 3, 4, c.chassisLight);
    fillBox(ox + 31, oy + 14, 2, 2, c.neon);
    px(ox + 33, oy + 13, c.rim);
    fillBox(ox + 29, oy + 19, 2, 2, c.accentDark);
  } else if (earType === "audio_pods") {
    fillBox(ox + 4, oy + 15, 3, 6, c.chassisDark);
    fillBox(ox + 5, oy + 16, 2, 4, c.antenna);
    px(ox + 5, oy + 17, "#FFFFFF");

    fillBox(ox + 29, oy + 15, 3, 6, c.chassisDark);
    fillBox(ox + 29, oy + 16, 2, 4, c.antenna);
    px(ox + 30, oy + 17, "#FFFFFF");
  } else if (earType === "armor_fins") {
    fillBox(ox + 4, oy + 13, 3, 9, c.chassisLight);
    fillBox(ox + 3, oy + 15, 2, 6, c.neon);
    px(ox + 3, oy + 14, c.rim);

    fillBox(ox + 29, oy + 13, 3, 9, c.chassisLight);
    fillBox(ox + 31, oy + 15, 2, 6, c.neon);
    px(ox + 32, oy + 14, c.rim);
  } else {
    fillBox(ox + 4, oy + 14, 3, 8, c.chassisDark);
    fillBox(ox + 5, oy + 15, 2, 6, c.chassisLight);
    fillBox(ox + 4, oy + 16, 1, 4, c.neon);

    fillBox(ox + 29, oy + 14, 3, 8, c.chassisDark);
    fillBox(ox + 29, oy + 15, 2, 6, c.chassisLight);
    fillBox(ox + 31, oy + 16, 1, 4, c.neon);
  }

  // ── C. Châssis Principal Chanfreiné (3 tons anodisés) ──
  fillBox(ox + 10, oy + 8, 16, 1, c.rim);
  fillBox(ox + 9, oy + 9, 18, 1, c.chassisLight);
  fillBox(ox + 8, oy + 10, 20, 1, c.chassisLight);
  fillBox(ox + 7, oy + 11, 22, 13, c.chassisMid);
  fillBox(ox + 8, oy + 24, 20, 1, c.chassisDark);
  fillBox(ox + 9, oy + 25, 18, 1, c.chassisDark);
  fillBox(ox + 10, oy + 26, 16, 1, "#020610");

  fillBox(ox + 7, oy + 12, 1, 11, c.chassisLight);
  fillBox(ox + 28, oy + 12, 1, 11, c.chassisLight);
  fillBox(ox + 7, oy + 16, 1, 3, c.neon);
  fillBox(ox + 28, oy + 16, 1, 3, c.neon);

  if (petDna?.hasForeheadGem) {
    fillBox(ox + 17, oy + 9, 2, 2, c.antenna);
    px(ox + 17, oy + 9, "#FFFFFF");
  }

  // ── D. Visière OLED Encastrée ──
  fillBox(ox + 10, oy + 12, 16, 11, c.visorBg);
  fillBox(ox + 9, oy + 13, 18, 9, c.visorBg);
  fillBox(ox + 10, oy + 12, 16, 1, "rgba(255, 255, 255, 0.16)");
  fillBox(ox + 10, oy + 22, 16, 1, "rgba(255, 255, 255, 0.06)");

  // ── E. Joues LED discrètes ──
  fillBox(ox + 10, oy + 20, 2, 1, c.cheek);
  fillBox(ox + 24, oy + 20, 2, 1, c.cheek);

  // ── F. Expressions d'Yeux (Humeurs + Quirks de Caractère) ──
  const rx = ox + Math.round(eyeX);
  const ry = oy + Math.round(eyeY);

  if (currentMood === "sleepy") {
    fillBox(ox + 12, oy + 17, 4, 1, c.neon);
    fillBox(ox + 20, oy + 17, 4, 1, c.neon);
    if (!reduceMotion) {
      const zProg = (time * 0.001) % 2;
      if (zProg < 1.2) {
        px(ox + 26, Math.floor(oy + 9 - zProg * 4), c.rim);
        px(ox + 27, Math.floor(oy + 8 - zProg * 4), c.rim);
      }
    }
    return;
  }

  if (currentMood === "visor") {
    fillBox(ox + 10, oy + 14, 16, 5, "rgba(245, 158, 11, 0.35)");
    fillBox(ox + 9, oy + 15, 18, 3, "#F59E0B");
    const lx = ox + 10 + Math.floor(scanPos);
    fillBox(lx, oy + 14, 2, 5, "#FEF3C7");
    return;
  }

  if (currentMood === "eating") {
    fillBox(ox + 12, oy + 15, 4, 3, c.neon);
    fillBox(ox + 20, oy + 15, 4, 3, c.neon);
    if (munchFrame % 2 === 0) {
      fillBox(ox + 16, oy + 20, 4, 2, c.antenna);
    } else {
      fillBox(ox + 16, oy + 21, 4, 1, c.antenna);
    }
    return;
  }

  if (currentMood === "radar") {
    fillBox(ox + 12, oy + 15, 4, 4, c.neon);
    fillBox(ox + 20, oy + 15, 4, 4, c.neon);
    px(ox + 13, oy + 16, c.visorBg);
    px(ox + 21, oy + 16, c.visorBg);
    return;
  }

  if (currentMood === "love") {
    const heartColor = reduceMotion || Math.sin(time * 0.008) > 0 ? c.antenna : c.cheek;
    fillBox(ox + 12, oy + 16, 4, 2, heartColor);
    px(ox + 13, oy + 18, heartColor);
    px(ox + 14, oy + 18, heartColor);
    fillBox(ox + 20, oy + 16, 4, 2, heartColor);
    px(ox + 21, oy + 18, heartColor);
    px(ox + 22, oy + 18, heartColor);
    return;
  }

  // Quirks de caractère actifs (lorsqu'il ne cligne pas des yeux)
  if (activeQuirk && !reduceMotion) {
    if (activeQuirk === "sparkle_hop") {
      // Clin d'œil malicieux (^ ▪) + joues rosées
      px(ox + 12, oy + 17, c.neon);
      px(ox + 13, oy + 16, c.neon);
      px(ox + 14, oy + 16, c.neon);
      px(ox + 15, oy + 17, c.neon);

      fillBox(ox + 20, oy + 15, 4, 4, c.neon);
      fillBox(ox + 21, oy + 16, 2, 2, c.pupil);
      px(ox + 21, oy + 16, "#FFFFFF");
      return;
    }
    if (activeQuirk === "curious_tilt") {
      // Regard curieux asymétrique (o O) balayant de gauche à droite
      const glance = Math.round(Math.sin(quirkProgress * Math.PI * 2) * 1.5);
      fillBox(ox + 12 + glance, oy + 16, 3, 2, c.neon);
      px(ox + 13 + glance, oy + 16, "#FFFFFF");

      fillBox(ox + 20 + glance, oy + 15, 4, 4, c.neon);
      fillBox(ox + 21 + glance, oy + 16, 2, 2, c.pupil);
      px(ox + 21 + glance, oy + 16, "#FFFFFF");
      return;
    }
    if (activeQuirk === "matrix_scan") {
      // Ligne de scan laser cyan traversant la visière
      const sx = ox + 10 + Math.round(((Math.sin(quirkProgress * Math.PI * 3) + 1) / 2) * 14);
      fillBox(ox + 10, oy + 16, 16, 2, "rgba(0, 245, 212, 0.2)");
      fillBox(sx, oy + 14, 2, 6, c.neon);
      fillBox(sx, oy + 15, 1, 4, "#FFFFFF");
      return;
    }
    if (activeQuirk === "plasma_surge" || activeQuirk === "star_orbit") {
      // Yeux rayonnants (^ ^) avec reflets blancs
      px(ox + 12, oy + 17, c.neon);
      px(ox + 13, oy + 16, "#FFFFFF");
      px(ox + 14, oy + 16, "#FFFFFF");
      px(ox + 15, oy + 17, c.neon);

      px(ox + 20, oy + 17, c.neon);
      px(ox + 21, oy + 16, "#FFFFFF");
      px(ox + 22, oy + 16, "#FFFFFF");
      px(ox + 23, oy + 17, c.neon);
      return;
    }
    if (activeQuirk === "rune_pulse") {
      // Regard zen méditatif lumineux (- -)
      fillBox(ox + 11, oy + 17, 5, 1, c.neon);
      fillBox(ox + 12, oy + 16, 3, 1, "#FFFFFF");
      fillBox(ox + 20, oy + 17, 5, 1, c.neon);
      fillBox(ox + 21, oy + 16, 3, 1, "#FFFFFF");
      return;
    }
  }

  if (currentMood === "happy" || isHovered) {
    px(ox + 12, oy + 17, c.neon);
    px(ox + 13, oy + 16, c.neon);
    px(ox + 14, oy + 16, c.neon);
    px(ox + 15, oy + 17, c.neon);

    px(ox + 20, oy + 17, c.neon);
    px(ox + 21, oy + 16, c.neon);
    px(ox + 22, oy + 16, c.neon);
    px(ox + 23, oy + 17, c.neon);
    return;
  }

  if (blinkProgress > 0.4) {
    fillBox(ox + 12, oy + 17, 4, 1, c.glow);
    fillBox(ox + 20, oy + 17, 4, 1, c.glow);
    return;
  }

  if (currentMood === "focused") {
    const leftX = rx + 11;
    const leftY = ry + 15;
    const rightX = rx + 21;
    const rightY = ry + 15;

    fillBox(leftX, leftY - 1, 3, 1, c.accentLight);
    fillBox(rightX + 1, rightY - 1, 3, 1, c.accentLight);

    fillBox(leftX, leftY, 4, 3, c.neon);
    fillBox(leftX + 1, leftY + 1, 2, 2, c.pupil);
    px(leftX + 2, leftY + 1, "#FFFFFF");

    fillBox(rightX, rightY, 4, 3, c.neon);
    fillBox(rightX + 1, rightY + 1, 2, 2, c.pupil);
    px(rightX + 1, rightY + 1, "#FFFFFF");
    return;
  }

  // Mode normal selon la morphologie oculaire de l'ADN
  const leftX = rx + 12;
  const leftY = ry + 15;
  const rightX = rx + 20;
  const rightY = ry + 15;

  if (eyeShape === "visor_strip") {
    fillBox(leftX, leftY + 1, 4, 2, c.neon);
    fillBox(rightX, rightY + 1, 4, 2, c.neon);
    px(leftX + 1, leftY + 1, "#FFFFFF");
    px(rightX + 1, rightY + 1, "#FFFFFF");
  } else if (eyeShape === "soft_corners") {
    fillBox(leftX, leftY + 1, 4, 2, c.neon);
    fillBox(leftX + 1, leftY, 2, 4, c.neon);
    fillBox(leftX + 1, leftY + 1, 2, 2, c.pupil);
    px(leftX + 1, leftY + 1, "#FFFFFF");

    fillBox(rightX, rightY + 1, 4, 2, c.neon);
    fillBox(rightX + 1, rightY, 2, 4, c.neon);
    fillBox(rightX + 1, rightY + 1, 2, 2, c.pupil);
    px(rightX + 1, rightY + 1, "#FFFFFF");
  } else {
    fillBox(leftX, leftY, 4, 4, c.neon);
    fillBox(leftX + 1, leftY + 1, 2, 2, c.pupil);
    px(leftX + 1, leftY + 1, "#FFFFFF");

    fillBox(rightX, rightY, 4, 4, c.neon);
    fillBox(rightX + 1, rightY + 1, 2, 2, c.pupil);
    px(rightX + 1, rightY + 1, "#FFFFFF");
  }
}

/**
 * Particules et glyphes animés reflétant la personnalité de chaque pet.
 */
export function drawQuirkEffects(px, fillBox, ox, oy, petDna, activeQuirk, p, fullBody = false, palette = null) {
  if (!activeQuirk || p <= 0 || p >= 1) return;
  const c = palette || resolveHeadPalette(petDna);
  const rise = Math.round(p * 6);
  const spread = fullBody ? 5 : 0;

  if (activeQuirk === "sparkle_hop") {
    const drawCross = (cx, cy, col) => {
      px(cx, cy, "#FFFFFF");
      px(cx - 1, cy, col);
      px(cx + 1, cy, col);
      px(cx, cy - 1, col);
      px(cx, cy + 1, col);
    };
    drawCross(ox + 3 - Math.round(spread * 0.4), oy + 8 - (rise % 5), c.neon);
    drawCross(ox + 32 + Math.round(spread * 0.4), oy + 6 - ((rise + 2) % 5), c.antenna);
    return;
  }

  if (activeQuirk === "plasma_surge") {
    const angle = p * Math.PI * 4;
    const x1 = Math.round(ox + 18 + Math.cos(angle) * (15 + spread));
    const y1 = Math.round(oy + 14 + Math.sin(angle) * 6);
    const x2 = Math.round(ox + 18 + Math.cos(angle + Math.PI) * (15 + spread));
    const y2 = Math.round(oy + 14 + Math.sin(angle + Math.PI) * 6);
    fillBox(x1, y1, 2, 2, c.antenna);
    px(x1, y1, "#FFFFFF");
    fillBox(x2, y2, 2, 2, c.neon);
    px(x2, y2, "#FFFFFF");
    return;
  }

  if (activeQuirk === "matrix_scan") {
    const m1 = oy + 20 - rise * 2;
    const m2 = oy + 24 - ((rise + 3) % 6) * 2;
    fillBox(ox + 1, m1, 1, 2, c.neon);
    px(ox + 3, m2, c.glow);
    fillBox(ox + 34, m2, 1, 2, c.neon);
    px(ox + 32, m1, c.accentLight);
    return;
  }

  if (activeQuirk === "star_orbit") {
    const a = p * Math.PI * 2;
    for (let i = 0; i < 3; i++) {
      const theta = a + (i * Math.PI * 2) / 3;
      const sx = Math.round(ox + 18 + Math.cos(theta) * (15 + spread));
      const sy = Math.round(oy + 10 + Math.sin(theta) * 7);
      px(sx, sy, i % 2 === 0 ? "#FFFFFF" : c.rim);
      if (i === 0) {
        px(sx - 1, sy, c.neon);
        px(sx + 1, sy, c.neon);
      }
    }
    return;
  }

  if (activeQuirk === "curious_tilt") {
    // Petit glyphe "?" pixel au-dessus du coin droit de la tête
    const qx = ox + 29 + (fullBody ? 2 : 0);
    const qy = oy + 3 - Math.round(Math.sin(p * Math.PI) * 2);
    fillBox(qx, qy, 3, 1, c.rim);
    px(qx + 2, qy + 1, c.rim);
    px(qx + 1, qy + 2, c.neon);
    px(qx + 1, qy + 4, "#FFFFFF");
    return;
  }

  if (activeQuirk === "rune_pulse") {
    const ry1 = oy + 22 - Math.round(p * 10);
    const ry2 = oy + 24 - Math.round(((p + 0.45) % 1) * 10);
    px(ox + 2 - Math.round(spread * 0.4), ry1, c.neon);
    px(ox + 33 + Math.round(spread * 0.4), ry1, c.neon);
    px(ox + 4, ry2, c.antenna);
    px(ox + 31, ry2, c.antenna);
  }
}
