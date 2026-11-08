// Générateur d'effets sonores Web Audio API haute fidélité (style Apple / iOS)
// Zéro dépendance externe, zéro latence, 100% hors ligne et fiable.

let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (AudioConstructor) {
      audioCtx = new AudioConstructor();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// 1. Carillon d'accordage Apple (style carillon de fin de timer iOS / fermeture anneau Apple Watch)
export function playAppleChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  // Accord harmonique maj7 cristallin (E5, G#5, B5, E6)
  const freqs = [659.25, 830.61, 987.77, 1318.51];
  freqs.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + idx * 0.07);

    gain.gain.setValueAtTime(0.001, now + idx * 0.07);
    gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.07 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.85);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.07);
    osc.stop(now + idx * 0.07 + 0.9);
  });
}

// 2. Micro-clic haptique discret pour boutons tactiles
export function playHapticTick() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "triangle";
  osc.frequency.setValueAtTime(850, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.025);

  gain.gain.setValueAtTime(0.07, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.035);
}

// 3. Double-ton de transition (passage Focus -> Repos)
export function playPhaseSwitchChime() {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const notes = [587.33, 880.0]; // D5 -> A5
  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + idx * 0.1);

    gain.gain.setValueAtTime(0.001, now + idx * 0.1);
    gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.1 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.7);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.1);
    osc.stop(now + idx * 0.1 + 0.75);
  });
}

