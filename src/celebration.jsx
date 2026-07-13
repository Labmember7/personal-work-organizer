import React, { useEffect, useRef } from "react";

// Célébration quand toutes les tâches sont terminées.
// Variante aléatoire à chaque fois + variante légendaire (1/1000).

export const LEGENDARY_ODDS = 1 / 1000;

const VARIANTS = ["confetti", "fireworks", "ribbons", "stardust", "petals"];

export function pickCelebration() {
  const legendary = Math.random() < LEGENDARY_ODDS;
  const variant = legendary
    ? "legendary"
    : VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
  return { variant, legendary, msg: 1 + Math.floor(Math.random() * 4) };
}

const PALETTE = ["#35A7A0", "#4CAF6D", "#E08A3C", "#5B8DEF", "#C678DD", "#E5C07B"];
const GOLD = ["#FFD86B", "#F5B942", "#FFF3C4", "#E8A020", "#FFE9A8"];

/* ---------------- Audio (Web Audio, tout est synthétisé) ---------------- */

let sharedCtx = null;
function getAudioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  if (sharedCtx.state === "suspended") sharedCtx.resume();
  return sharedCtx;
}

// Bus master avec un écho discret pour donner de l'espace au son.
function makeBus(ctx, volume) {
  const master = ctx.createGain();
  master.gain.value = volume;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.28;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  master.connect(ctx.destination);
  master.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  wet.connect(ctx.destination);
  return master;
}

function tone(ctx, dest, { freq, at, dur, type = "sine", vol = 0.2, attack = 0.015, glideTo = null }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Cloche : fondamentale + partiels légèrement désaccordés.
function bell(ctx, dest, { freq, at, dur = 1.6, vol = 0.16 }) {
  tone(ctx, dest, { freq, at, dur, type: "sine", vol });
  tone(ctx, dest, { freq: freq * 2.01, at, dur: dur * 0.6, type: "sine", vol: vol * 0.35 });
  tone(ctx, dest, { freq: freq * 2.99, at, dur: dur * 0.35, type: "sine", vol: vol * 0.15 });
}

// Bruit filtré : sert de montée (riser) ou de cymbale/souffle.
function noise(ctx, dest, { at, dur, from, to, vol = 0.1, type = "bandpass", q = 1, swell = true }) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const t0 = ctx.currentTime + at;
  filter.frequency.setValueAtTime(from, t0);
  filter.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  if (swell) {
    gain.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.82);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  } else {
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  src.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  src.start(t0);
  src.stop(t0 + dur);
}

const N = {
  C2: 65.41, C3: 130.81, G3: 196.0,
  C4: 261.63, E4: 329.63, G4: 392.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, A6: 1760.0, B6: 1975.53,
  C7: 2093.0, E7: 2637.02, G7: 3135.96,
};

const SOUNDS = {
  // Fanfare de clochettes : basse ronde, arpège brillant, cloche finale.
  confetti(ctx, bus) {
    tone(ctx, bus, { freq: N.C3, at: 0, dur: 2.2, type: "sine", vol: 0.16, attack: 0.04 });
    [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7].forEach((f, i) =>
      bell(ctx, bus, { freq: f, at: i * 0.08, vol: 0.15 })
    );
    noise(ctx, bus, { at: 0, dur: 0.5, from: 4000, to: 9000, vol: 0.035, type: "highpass", swell: false });
    bell(ctx, bus, { freq: N.C7, at: 0.72, dur: 2.6, vol: 0.13 });
    bell(ctx, bus, { freq: N.E7, at: 0.88, dur: 2.2, vol: 0.08 });
  },
  // Montée, double détonation profonde, pluie d'étincelles.
  fireworks(ctx, bus) {
    noise(ctx, bus, { at: 0, dur: 0.7, from: 300, to: 2400, vol: 0.06 });
    tone(ctx, bus, { freq: 120, at: 0.7, dur: 1.0, type: "sine", vol: 0.32, glideTo: 40 });
    noise(ctx, bus, { at: 0.7, dur: 0.9, from: 5000, to: 800, vol: 0.05, swell: false });
    const sparks = [N.E6, N.G6, N.B6, N.C7, N.A6, N.E7, N.G6, N.C7, N.E7, N.B6];
    sparks.forEach((f, i) =>
      bell(ctx, bus, { freq: f, at: 1.0 + i * 0.1 + Math.random() * 0.04, dur: 1.2, vol: 0.09 })
    );
    tone(ctx, bus, { freq: 100, at: 2.1, dur: 0.9, type: "sine", vol: 0.22, glideTo: 38 });
  },
  // Double glissando de harpe sur pédale de basse.
  ribbons(ctx, bus) {
    tone(ctx, bus, { freq: N.C3, at: 0, dur: 3.4, type: "sine", vol: 0.13, attack: 0.08 });
    [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7].forEach((f, i) =>
      tone(ctx, bus, { freq: f, at: i * 0.05, dur: 1.5, type: "triangle", vol: 0.13 })
    );
    [N.G5, N.C6, N.E6, N.G6, N.C7, N.E7].forEach((f, i) =>
      tone(ctx, bus, { freq: f, at: 1.1 + i * 0.06, dur: 1.6, type: "triangle", vol: 0.1 })
    );
    bell(ctx, bus, { freq: N.C7, at: 1.7, dur: 2.4, vol: 0.1 });
  },
  // Boîte à musique sur nappe douce.
  stardust(ctx, bus) {
    [N.C4, N.G4, N.E5].forEach((f) =>
      tone(ctx, bus, { freq: f, at: 0, dur: 3.6, type: "sine", vol: 0.06, attack: 0.5 })
    );
    const motif = [N.E6, N.G6, N.C7, N.B6, N.G6, N.E6, N.G6, N.C7];
    motif.forEach((f, i) => bell(ctx, bus, { freq: f, at: i * 0.15, dur: 1.4, vol: 0.12 }));
    bell(ctx, bus, { freq: N.E7, at: 1.45, dur: 2.6, vol: 0.08 });
  },
  // Accord Cmaj9 en éventail, arpège de harpe par-dessus.
  petals(ctx, bus) {
    [N.C4, N.E4, N.G4, N.B4, N.D5].forEach((f, i) =>
      tone(ctx, bus, { freq: f, at: i * 0.05, dur: 3.6, type: "triangle", vol: 0.09, attack: 0.12 })
    );
    [N.G5, N.B5, N.D6, N.G6].forEach((f, i) =>
      tone(ctx, bus, { freq: f, at: 0.7 + i * 0.09, dur: 2.0, type: "triangle", vol: 0.08 })
    );
    bell(ctx, bus, { freq: N.G6, at: 1.3, dur: 2.6, vol: 0.08 });
  },
  // Légendaire : montée, gong + cymbale, harpe sur trois octaves,
  // grand accord en crescendo, cascade d'étincelles, résolution grave.
  legendary(ctx, bus) {
    noise(ctx, bus, { at: 0, dur: 1.2, from: 200, to: 3200, vol: 0.08 });
    tone(ctx, bus, { freq: 98, at: 1.2, dur: 4.0, type: "sine", vol: 0.3, glideTo: 55 });
    tone(ctx, bus, { freq: N.C2, at: 1.2, dur: 3.2, type: "sine", vol: 0.18 });
    tone(ctx, bus, { freq: 196.5, at: 1.2, dur: 2.6, type: "sine", vol: 0.1 });
    noise(ctx, bus, { at: 1.2, dur: 1.6, from: 7000, to: 1500, vol: 0.05, type: "highpass", swell: false });
    [N.C4, N.E4, N.G4, N.C5, N.E5, N.G5, N.C6, N.E6, N.G6, N.C7, N.E7, N.G7].forEach((f, i) =>
      tone(ctx, bus, { freq: f, at: 1.5 + i * 0.065, dur: 1.9, type: "triangle", vol: 0.11 })
    );
    [N.C3, N.G3, N.C4, N.E4, N.G4, N.D5, N.E5].forEach((f) =>
      tone(ctx, bus, { freq: f, at: 2.4, dur: 5.0, type: "sine", vol: 0.075, attack: 1.1 })
    );
    for (let i = 0; i < 18; i++) {
      const highs = [N.C7, N.E7, N.G7, N.B6, N.G6, N.E6];
      bell(ctx, bus, {
        freq: highs[i % highs.length],
        at: 2.8 + i * 0.14 + Math.random() * 0.05,
        dur: 1.3,
        vol: 0.055,
      });
    }
    bell(ctx, bus, { freq: N.C6, at: 5.6, dur: 3.4, vol: 0.14 });
    tone(ctx, bus, { freq: N.C2, at: 5.6, dur: 3.4, type: "sine", vol: 0.14, attack: 0.05 });
    noise(ctx, bus, { at: 5.6, dur: 1.4, from: 8000, to: 2000, vol: 0.03, type: "highpass", swell: false });
  },
};

export function playCelebrationSound(variant) {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const bus = makeBus(ctx, variant === "legendary" ? 0.5 : 0.4);
    (SOUNDS[variant] || SOUNDS.confetti)(ctx, bus);
  } catch (e) {
    // audio indisponible : la célébration reste visuelle
  }
}

/* ---------------- Particules (canvas) ---------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const easeOut = (x) => 1 - (1 - x) * (1 - x);

function burst(add, x, y, { count, color, speed = [0.08, 0.34], size = [1.4, 2.6], life = [1100, 1900], g = 0.00028 }) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(-0.06, 0.06);
    const sp = rand(speed[0], speed[1]);
    add({
      kind: "spark", x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      g, drag: 0.995,
      size: rand(size[0], size[1]),
      color: typeof color === "function" ? color() : color,
      life: rand(life[0], life[1]), twinkle: Math.random() < 0.45,
    });
  }
}

// Chaque variante définit : duration, spawn(t, dt, add, w, h, state) et le
// rendu est piloté par p.kind (rect | spark | trail | orb | petal | ray | ring | flash).
const ANIMS = {
  confetti: {
    duration: 5000,
    spawn(t, dt, add, w, h, state) {
      // Double salve centrale à l'ouverture.
      if (!state.opened) {
        state.opened = true;
        burst(add, w / 2, h * 0.4, { count: 50, color: () => pick(PALETTE), speed: [0.1, 0.42], life: [900, 1600] });
      }
      if (t > 260 && !state.opened2) {
        state.opened2 = true;
        burst(add, w / 2, h * 0.35, { count: 36, color: () => pick(PALETTE), speed: [0.08, 0.32], life: [900, 1500] });
      }
      // Canons dans les coins.
      if (t > 2000) return;
      for (let i = 0; i < dt * 0.1; i++) {
        const left = Math.random() < 0.5;
        add({
          kind: "rect",
          x: left ? -10 : w + 10,
          y: h * rand(0.55, 0.95),
          vx: (left ? 1 : -1) * rand(0.25, 0.78),
          vy: rand(-1.1, -0.55),
          g: 0.0011,
          drag: 0.9985,
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.012, 0.012),
          size: rand(5, 10),
          color: pick(PALETTE),
          life: rand(2600, 4200),
        });
      }
    },
  },
  fireworks: {
    duration: 5800,
    spawn(t, dt, add, w, h, state) {
      state.rockets = state.rockets ?? [];
      state.crackles = state.crackles ?? [];
      state.next = state.next ?? 80;
      // Lancement des fusées.
      if (t >= state.next && t < 3400) {
        state.next = t + rand(420, 720);
        state.rockets.push({
          sx: w * rand(0.25, 0.75), ex: w * rand(0.15, 0.85), ey: h * rand(0.14, 0.42),
          t0: t, dur: rand(520, 720), color: pick(PALETTE), done: false,
        });
      }
      for (const r of state.rockets) {
        if (r.done) continue;
        const prog = (t - r.t0) / r.dur;
        if (prog >= 1) {
          r.done = true;
          burst(add, r.ex, r.ey, { count: 80, color: r.color });
          add({ kind: "ring", x: r.ex, y: r.ey, size: 6, grow: 0.34, color: r.color, life: 550 });
          // Crépitement secondaire un peu plus tard.
          state.crackles.push({ at: t + rand(280, 450), x: r.ex + rand(-30, 30), y: r.ey + rand(-20, 30), color: r.color });
          continue;
        }
        // Traînée ascendante de la fusée.
        const x = r.sx + (r.ex - r.sx) * prog;
        const y = h + 10 - (h + 10 - r.ey) * easeOut(prog);
        add({
          kind: "spark", x: x + rand(-1.5, 1.5), y,
          vx: rand(-0.015, 0.015), vy: rand(0.02, 0.07),
          g: 0, drag: 1, size: rand(1, 2), color: "#FFE9A8",
          life: rand(260, 450), twinkle: false,
        });
      }
      state.crackles = state.crackles.filter((c) => {
        if (t < c.at) return true;
        burst(add, c.x, c.y, { count: 16, color: c.color, speed: [0.03, 0.12], size: [1, 1.8], life: [500, 900] });
        return false;
      });
    },
  },
  ribbons: {
    duration: 5000,
    spawn(t, dt, add, w, h) {
      if (t > 1800) return;
      for (let i = 0; i < dt * 0.024; i++) {
        add({
          kind: "trail",
          x: w * rand(0.05, 0.95), y: h + 12,
          vx: rand(-0.05, 0.05), vy: rand(-0.52, -0.3),
          g: 0.00012, drag: 1,
          wob: rand(0.004, 0.008), wobAmp: rand(0.1, 0.24), phase: rand(0, 6.28),
          size: rand(2, 3.6), color: pick(PALETTE),
          life: rand(2800, 4200), hist: [], glow: true,
        });
      }
    },
  },
  stardust: {
    duration: 5500,
    spawn(t, dt, add, w, h, state) {
      if (t < 3000) {
        for (let i = 0; i < dt * 0.035; i++) {
          add({
            kind: "orb",
            x: w * Math.random(), y: h + 10,
            vx: rand(-0.03, 0.03), vy: rand(-0.17, -0.06),
            g: 0, drag: 1,
            size: rand(1.5, 4.5), color: Math.random() < 0.3 ? "#FFFFFF" : pick(PALETTE),
            life: rand(2400, 4400), twinkle: true, phase: rand(0, 6.28),
          });
        }
      }
      // Étoiles filantes qui traversent le haut de l'écran.
      state.nextStar = state.nextStar ?? 500;
      if (t >= state.nextStar && t < 4200) {
        state.nextStar = t + rand(700, 1300);
        const ltr = Math.random() < 0.5;
        add({
          kind: "trail",
          x: ltr ? -20 : w + 20, y: h * rand(0.08, 0.3),
          vx: (ltr ? 1 : -1) * rand(0.55, 0.85), vy: rand(0.06, 0.14),
          g: 0, drag: 1, size: 2.2, color: "#FFFFFF",
          life: rand(1100, 1600), hist: [], glow: true,
        });
      }
    },
  },
  petals: {
    duration: 5600,
    spawn(t, dt, add, w, h) {
      if (t < 3200) {
        for (let i = 0; i < dt * 0.026; i++) {
          add({
            kind: "petal",
            x: w * Math.random(), y: -14,
            vx: rand(-0.04, 0.04), vy: rand(0.09, 0.2),
            g: 0, drag: 1,
            wob: rand(0.002, 0.005), wobAmp: rand(0.5, 1.1), phase: rand(0, 6.28),
            rot: rand(0, 6.28), vr: rand(-0.004, 0.004),
            size: rand(5, 9), color: pick(["#E8A0BF", "#C678DD", "#F5C4D6", "#E5C07B", "#FFFFFF"]),
            life: rand(3800, 5400),
          });
        }
      }
      // Lucioles discrètes en contre-point.
      if (t < 3600 && Math.random() < dt * 0.004) {
        add({
          kind: "orb",
          x: w * Math.random(), y: h * rand(0.4, 0.95),
          vx: rand(-0.02, 0.02), vy: rand(-0.06, -0.02),
          g: 0, drag: 1, size: rand(1.5, 2.8), color: "#E5C07B",
          life: rand(2000, 3400), twinkle: true, phase: rand(0, 6.28),
        });
      }
    },
  },
  legendary: {
    duration: 10000,
    spawn(t, dt, add, w, h, state) {
      const cx = w / 2;
      const cy = h * 0.42;
      // Éclair initial, ondes de choc et rayons rotatifs.
      if (!state.boom) {
        state.boom = true;
        add({ kind: "flash", x: cx, y: cy, size: Math.max(w, h), color: "#FFF3C4", life: 700 });
        for (let r = 0; r < 4; r++) {
          add({ kind: "ring", x: cx, y: cy, size: 8, grow: 0.5 + r * 0.26, color: GOLD[r % GOLD.length], life: 1600, delay: r * 150 });
        }
        for (let i = 0; i < 24; i++) {
          add({ kind: "ray", x: cx, y: cy, angle: (i / 24) * Math.PI * 2, va: 0.00042, len: Math.min(w, h) * 0.48, color: "#FFD86B", life: 6000 });
        }
        // Comètes en spirale autour du centre.
        for (let i = 0; i < 6; i++) {
          add({
            kind: "trail",
            x: cx, y: cy, vx: 0, vy: 0, g: 0, drag: 1,
            orbit: { ox: cx, oy: cy, a: (i / 6) * Math.PI * 2, va: rand(0.0018, 0.0026), r: 10, vr: rand(0.045, 0.075) },
            size: rand(2.2, 3.2), color: pick(GOLD),
            life: rand(2600, 3600), hist: [], glow: true,
          });
        }
      }
      // Seconde vague à contretemps.
      if (t > 1400 && !state.wave2) {
        state.wave2 = true;
        add({ kind: "flash", x: cx, y: cy, size: Math.max(w, h) * 0.7, color: "#FFD86B", life: 500 });
        for (let r = 0; r < 2; r++) {
          add({ kind: "ring", x: cx, y: cy, size: 8, grow: 0.62 + r * 0.3, color: GOLD[r], life: 1300, delay: r * 130 });
        }
        burst(add, cx, cy, { count: 90, color: () => pick(GOLD), speed: [0.1, 0.5], life: [1600, 3200], g: 0.00016 });
      }
      // Supernova : étincelles dorées émises depuis le centre.
      if (t < 5000) {
        for (let i = 0; i < dt * 0.055; i++) {
          const a = rand(0, Math.PI * 2);
          const sp = rand(0.05, 0.4);
          add({
            kind: "spark", x: cx, y: cy,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            g: 0.00016, drag: 0.996,
            size: rand(1.4, 3.2), color: pick(GOLD),
            life: rand(1600, 3400), twinkle: true,
          });
        }
      }
      // Pluie d'or continue.
      if (t > 800 && t < 7800) {
        for (let i = 0; i < dt * 0.05; i++) {
          add({
            kind: "rect",
            x: w * Math.random(), y: -12,
            vx: rand(-0.03, 0.03), vy: rand(0.14, 0.32),
            g: 0.00006, drag: 1,
            rot: rand(0, 6.28), vr: rand(-0.01, 0.01),
            size: rand(3.5, 7), color: pick(GOLD),
            life: rand(3000, 5400),
          });
        }
      }
      // Braises qui s'élèvent du bas de l'écran.
      if (t > 1500 && t < 7500 && Math.random() < dt * 0.015) {
        add({
          kind: "orb",
          x: w * Math.random(), y: h + 8,
          vx: rand(-0.02, 0.02), vy: rand(-0.14, -0.06),
          g: 0, drag: 1, size: rand(1.4, 3), color: pick(GOLD),
          life: rand(2400, 4200), twinkle: true, phase: rand(0, 6.28),
        });
      }
    },
  },
};

function drawParticle(g, p, age) {
  const fade = Math.max(0, 1 - age / p.life);
  g.globalAlpha = fade;
  switch (p.kind) {
    case "rect":
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      // L'oscillation sur l'échelle Y simule le papier qui tournoie.
      g.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(age * 0.008 + p.size)));
      g.fillStyle = p.color;
      g.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
      g.restore();
      break;
    case "spark": {
      const tw = p.twinkle ? 0.55 + 0.45 * Math.sin(age * 0.03 + p.size * 7) : 1;
      g.globalAlpha = fade * tw;
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 6;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      break;
    }
    case "trail":
      if (p.hist.length > 1) {
        g.strokeStyle = p.color;
        g.lineWidth = p.size;
        g.lineCap = "round";
        if (p.glow) {
          g.shadowColor = p.color;
          g.shadowBlur = 8;
        }
        g.beginPath();
        g.moveTo(p.hist[0].x, p.hist[0].y);
        for (const pt of p.hist) g.lineTo(pt.x, pt.y);
        g.lineTo(p.x, p.y);
        g.stroke();
        g.shadowBlur = 0;
      }
      break;
    case "orb": {
      const tw = 0.5 + 0.5 * Math.sin(age * 0.006 + p.phase);
      g.globalAlpha = fade * tw;
      g.fillStyle = p.color;
      g.shadowColor = p.color;
      g.shadowBlur = 10;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      if (p.size > 3) {
        g.strokeStyle = p.color;
        g.lineWidth = 0.8;
        const r = p.size * 2.4 * tw;
        g.beginPath();
        g.moveTo(p.x - r, p.y); g.lineTo(p.x + r, p.y);
        g.moveTo(p.x, p.y - r); g.lineTo(p.x, p.y + r);
        g.stroke();
      }
      break;
    }
    case "petal":
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.color;
      g.beginPath();
      g.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
      break;
    case "ray": {
      g.globalAlpha = fade * 0.28;
      const grad = g.createLinearGradient(
        p.x, p.y,
        p.x + Math.cos(p.angle) * p.len, p.y + Math.sin(p.angle) * p.len
      );
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "transparent");
      g.strokeStyle = grad;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x + Math.cos(p.angle) * p.len, p.y + Math.sin(p.angle) * p.len);
      g.stroke();
      break;
    }
    case "ring":
      if (age < (p.delay || 0)) break;
      g.globalAlpha = fade * 0.7;
      g.strokeStyle = p.color;
      g.lineWidth = Math.max(1, 5 * fade);
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.stroke();
      break;
    case "flash": {
      g.globalAlpha = fade * 0.5;
      const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "transparent");
      g.fillStyle = grad;
      g.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
      break;
    }
    default:
      break;
  }
  g.globalAlpha = 1;
}

function stepParticle(p, dt, age) {
  if (p.kind === "ring") {
    if (age >= (p.delay || 0)) p.size += p.grow * dt;
    return;
  }
  if (p.kind === "ray") {
    p.angle += p.va * dt;
    return;
  }
  if (p.kind === "flash") return;
  if (p.kind === "trail") {
    p.hist.push({ x: p.x, y: p.y });
    if (p.hist.length > 14) p.hist.shift();
    if (p.orbit) {
      const o = p.orbit;
      o.a += o.va * dt;
      o.r += o.vr * dt;
      p.x = o.ox + Math.cos(o.a) * o.r;
      p.y = o.oy + Math.sin(o.a) * o.r * 0.7;
      return;
    }
  }
  p.vy += (p.g || 0) * dt;
  p.vx *= p.drag ?? 1;
  p.vy *= p.drag ?? 1;
  let wobble = 0;
  if (p.wob) wobble = Math.sin(age * p.wob + p.phase) * p.wobAmp;
  p.x += (p.vx + wobble * 0.1) * dt;
  p.y += p.vy * dt;
  if (p.vr) p.rot += p.vr * dt;
}

/* ---------------- Mini célébration (une tâche terminée) ---------------- */

const MINI_DURATION = 1700;

function playMiniSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const bus = makeBus(ctx, 0.25);
    bell(ctx, bus, { freq: N.G5, at: 0, dur: 0.9, vol: 0.14 });
    bell(ctx, bus, { freq: N.C6, at: 0.09, dur: 1.1, vol: 0.12 });
    bell(ctx, bus, { freq: N.E6, at: 0.18, dur: 1.3, vol: 0.1 });
  } catch (e) {
    // audio indisponible : l'effet reste visuel
  }
}

export function MiniCelebration({ onDone }) {
  const canvasRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const soundPlayed = useRef(false);

  useEffect(() => {
    // Idempotent : le son ne rejoue pas si l'effet est ré-exécuté (double montage).
    if (!soundPlayed.current) {
      soundPlayed.current = true;
      playMiniSound();
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let raf = 0;
    let closed = false;
    const end = setTimeout(() => {
      closed = true;
      cancelAnimationFrame(raf);
      onDoneRef.current?.();
    }, reduced ? 400 : MINI_DURATION);

    if (!reduced) {
      const canvas = canvasRef.current;
      const g = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      const parts = [];
      const add = (p) => parts.push({ ...p, born: performance.now() });
      burst(add, w / 2, h * 0.35, { count: 34, color: () => pick(PALETTE), speed: [0.08, 0.3], life: [700, 1300] });
      for (let i = 0; i < 14; i++) {
        add({
          kind: "rect",
          x: w / 2 + rand(-30, 30), y: h * 0.35,
          vx: rand(-0.3, 0.3), vy: rand(-0.5, -0.15),
          g: 0.0009, drag: 0.998,
          rot: rand(0, 6.28), vr: rand(-0.01, 0.01),
          size: rand(4, 8), color: pick(PALETTE),
          life: rand(900, 1500),
        });
      }

      let last = performance.now();
      const frame = (now) => {
        if (closed) return;
        const dt = Math.min(now - last, 50);
        last = now;
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          const age = now - p.born;
          if (age > p.life) {
            parts.splice(i, 1);
            continue;
          }
          stepParticle(p, dt, age);
          drawParticle(g, p, age);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }
    return () => {
      closed = true;
      clearTimeout(end);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="trk-mini-celebration" aria-hidden="true">
      <style>{`
        .trk-mini-celebration {
          position: fixed;
          inset: 0;
          z-index: 70;
          pointer-events: none;
        }
        .trk-mini-celebration canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
      <canvas ref={canvasRef} />
    </div>
  );
}

/* ---------------- Composant overlay ---------------- */

const FADE_OUT_MS = 700;

export function CelebrationOverlay({ variant, legendary, title, subtitle, onDone }) {
  const canvasRef = useRef(null);
  const rootRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const soundedVariant = useRef(null);

  useEffect(() => {
    // Idempotent : un seul son par variante, même si l'effet est ré-exécuté.
    if (soundedVariant.current !== variant) {
      soundedVariant.current = variant;
      playCelebrationSound(variant);
    }
    const anim = ANIMS[variant] || ANIMS.confetti;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const duration = reduced ? 2600 : anim.duration;

    let raf = 0;
    let closed = false;
    // Fondu de sortie de tout l'overlay avant le démontage.
    const fade = setTimeout(() => {
      rootRef.current?.classList.add("closing");
    }, duration - FADE_OUT_MS);
    const end = setTimeout(() => {
      closed = true;
      cancelAnimationFrame(raf);
      onDoneRef.current?.();
    }, duration);

    if (!reduced) {
      const canvas = canvasRef.current;
      const g = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const resize = () => {
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
      };
      resize();
      window.addEventListener("resize", resize);

      const parts = [];
      const state = {};
      const start = performance.now();
      let last = start;
      const add = (p) => {
        if (parts.length < 1100) parts.push({ ...p, born: performance.now() });
      };

      const frame = (now) => {
        if (closed) return;
        const t = now - start;
        const dt = Math.min(now - last, 50);
        last = now;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        anim.spawn(t, dt, add, w, h, state);

        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          const age = now - p.born;
          if (age > p.life) {
            parts.splice(i, 1);
            continue;
          }
          stepParticle(p, dt, age);
          drawParticle(g, p, age);
        }
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      return () => {
        closed = true;
        clearTimeout(fade);
        clearTimeout(end);
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", resize);
      };
    }
    return () => {
      clearTimeout(fade);
      clearTimeout(end);
    };
  }, [variant]);

  return (
    <div ref={rootRef} className={"trk-celebration" + (legendary ? " legendary" : "")} aria-hidden="true">
      <style>{`
        .trk-celebration {
          position: fixed;
          inset: 0;
          z-index: 80;
          pointer-events: none;
          animation: trk-celebration-fade 0.4s ease;
          opacity: 1;
          transition: opacity 0.7s ease;
        }
        .trk-celebration.closing { opacity: 0; }
        .trk-celebration.legendary {
          background: radial-gradient(ellipse at 50% 42%, rgba(255, 216, 107, 0.16), transparent 62%);
        }
        .trk-celebration canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        @keyframes trk-celebration-fade {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .trk-celebration-msg {
          position: absolute;
          left: 50%;
          top: 42%;
          transform: translate(-50%, -50%);
          text-align: center;
          padding: 34px 70px;
          animation: trk-celebration-msg-in 0.7s cubic-bezier(0.18, 0.9, 0.3, 1.15) backwards;
        }
        /* Voile sombre sous le texte, fondu sur les bords pour la lisibilité. */
        .trk-celebration-msg::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: -1;
          background: radial-gradient(ellipse closest-side,
            rgba(0, 0, 0, 0.5) 0%,
            rgba(0, 0, 0, 0.44) 30%,
            rgba(0, 0, 0, 0.32) 50%,
            rgba(0, 0, 0, 0.18) 68%,
            rgba(0, 0, 0, 0.07) 84%,
            rgba(0, 0, 0, 0) 100%);
        }
        .trk-celebration.legendary .trk-celebration-msg {
          animation-delay: 0.9s;
          animation-duration: 1s;
        }
        @keyframes trk-celebration-msg-in {
          from { opacity: 0; transform: translate(-50%, -30%) scale(0.82); filter: blur(6px); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); filter: blur(0); }
        }
        .trk-celebration-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: var(--text);
          text-shadow: 0 2px 18px var(--shadow);
          margin: 0;
        }
        .trk-celebration-sub {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px;
          letter-spacing: 2.5px;
          color: var(--text-dim);
          margin: 10px 0 0;
        }
        .trk-celebration-ornament {
          display: none;
          font-size: 15px;
          color: #E5C07B;
          letter-spacing: 6px;
          margin: 0 0 10px;
          animation: trk-ornament-glow 2.2s ease-in-out infinite;
        }
        .trk-celebration.legendary .trk-celebration-ornament { display: block; }
        @keyframes trk-ornament-glow {
          0%, 100% { opacity: 0.55; text-shadow: 0 0 6px rgba(229, 192, 123, 0.4); }
          50% { opacity: 1; text-shadow: 0 0 18px rgba(255, 216, 107, 0.9); }
        }
        .trk-celebration.legendary .trk-celebration-title {
          font-size: 42px;
          letter-spacing: 1.5px;
          background: linear-gradient(100deg, #E8A020, #FFF3C4 30%, #FFD86B 50%, #FFF3C4 70%, #E8A020);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: trk-gold-shimmer 2.4s linear infinite;
          text-shadow: none;
          filter: drop-shadow(0 2px 16px rgba(232, 160, 32, 0.6));
        }
        .trk-celebration.legendary .trk-celebration-sub {
          color: #E5C07B;
          letter-spacing: 3.5px;
        }
        @keyframes trk-gold-shimmer {
          from { background-position: 200% 0; }
          to { background-position: -200% 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .trk-celebration, .trk-celebration * { animation: none !important; }
        }
      `}</style>
      <canvas ref={canvasRef} />
      <div className="trk-celebration-msg">
        <p className="trk-celebration-ornament">✦ ✦ ✦</p>
        <p className="trk-celebration-title">{title}</p>
        {subtitle && <p className="trk-celebration-sub">{subtitle}</p>}
      </div>
    </div>
  );
}
