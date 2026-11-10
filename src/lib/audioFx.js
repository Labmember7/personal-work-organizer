// Générateur d'effets sonores Web Audio API ultra-basse latence (style Apple / iOS)
// Optimisé pour une réactivité instantanée (0 ms de latence) :
// - Déverrouillage automatique du contexte audio dès le premier geste utilisateur
// - Pré-synthèse en mémoire vive des buffers audio PCM (AudioBuffer)
// - Lecture immédiate via AudioBufferSourceNode sans délai d'initialisation ni allocation à chaud

let audioCtx = null;
let masterGain = null;

// Cache en mémoire des tampons audio pré-rendus
const buffers = {
  haptic: null,
  chime: null,
  phaseSwitch: null,
  taskDone: null,
};

export function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (AudioConstructor) {
      try {
        audioCtx = new AudioConstructor();
        masterGain = audioCtx.createGain();
        masterGain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        masterGain.connect(audioCtx.destination);
      } catch {
        return null;
      }
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Déverrouillage anticipé du moteur audio dès l'entrée de la souris ou la première touche
if (typeof window !== "undefined") {
  const warmAudioEngine = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    // Pré-génération asynchrone des tampons en arrière-plan
    if (ctx && !buffers.haptic) {
      try {
        buffers.haptic = buildHapticBuffer(ctx);
        buffers.chime = buildChimeBuffer(ctx);
        buffers.phaseSwitch = buildPhaseSwitchBuffer(ctx);
        buffers.taskDone = buildTaskDoneCelebrationBuffer(ctx);
      } catch {
        // Repli sur la synthèse en direct lors de la lecture
      }
    }
  };

  window.addEventListener("pointerdown", warmAudioEngine, { capture: true, passive: true });
  window.addEventListener("keydown", warmAudioEngine, { capture: true, passive: true });
}

// ── Générateurs PCM des effets sonores (synthèse mathématique pure) ──

// 1. Clic haptique : transitoire triangle rapide descendant 850 Hz -> 220 Hz (35 ms)
function buildHapticBuffer(ctx) {
  if (!ctx?.createBuffer) return null;
  const sampleRate = ctx.sampleRate || 44100;
  const dur = 0.035;
  const length = Math.max(1, Math.floor(sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const p = t / dur;
    const freq = 850 * Math.pow(220 / 850, p);
    phase += (2 * Math.PI * freq) / sampleRate;
    const tri = (2 / Math.PI) * Math.asin(Math.sin(phase));
    const envelope = 0.08 * Math.exp(-p * 5.5);
    data[i] = tri * envelope;
  }
  return buffer;
}

// 2. Carillon Apple : accord harmonique Maj7 cristallin (E5, G#5, B5, E6)
function buildChimeBuffer(ctx) {
  if (!ctx?.createBuffer) return null;
  const sampleRate = ctx.sampleRate || 44100;
  const dur = 1.15;
  const length = Math.max(1, Math.floor(sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const notes = [
    { freq: 659.25, start: 0.00, dur: 0.85, vol: 0.16 }, // E5
    { freq: 830.61, start: 0.07, dur: 0.85, vol: 0.17 }, // G#5
    { freq: 987.77, start: 0.14, dur: 0.85, vol: 0.18 }, // B5
    { freq: 1318.51, start: 0.21, dur: 0.90, vol: 0.20 }, // E6
  ];

  for (const note of notes) {
    const startIdx = Math.floor(note.start * sampleRate);
    const noteLen = Math.floor(note.dur * sampleRate);
    let phase = 0;

    for (let i = 0; i < noteLen && startIdx + i < length; i++) {
      const t = i / sampleRate;
      phase += (2 * Math.PI * note.freq) / sampleRate;
      // Attaque douce 20ms puis décroissance exponentielle
      const attack = Math.min(1, t / 0.02);
      const decay = Math.exp(-t * 3.8);
      const sample = Math.sin(phase) * note.vol * attack * decay;
      data[startIdx + i] += sample;
    }
  }

  return buffer;
}

// 3. Carillon de transition : double-ton D5 -> A5 (passage Focus -> Repos)
function buildPhaseSwitchBuffer(ctx) {
  if (!ctx?.createBuffer) return null;
  const sampleRate = ctx.sampleRate || 44100;
  const dur = 0.95;
  const length = Math.max(1, Math.floor(sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const notes = [
    { freq: 587.33, start: 0.00, dur: 0.70, vol: 0.16 }, // D5
    { freq: 880.00, start: 0.10, dur: 0.80, vol: 0.18 }, // A5
  ];

  for (const note of notes) {
    const startIdx = Math.floor(note.start * sampleRate);
    const noteLen = Math.floor(note.dur * sampleRate);
    let phase = 0;

    for (let i = 0; i < noteLen && startIdx + i < length; i++) {
      const t = i / sampleRate;
      phase += (2 * Math.PI * note.freq) / sampleRate;
      const attack = Math.min(1, t / 0.02);
      const decay = Math.exp(-t * 4.2);
      const sample = Math.sin(phase) * note.vol * attack * decay;
      data[startIdx + i] += sample;
    }
  }

  return buffer;
}

// 4. Carillon de célébration tâche accomplie : arpège dynamique C-Major cristallin (C5, E5, G5, C6) avec corps chaud
function buildTaskDoneCelebrationBuffer(ctx) {
  if (!ctx?.createBuffer) return null;
  const sampleRate = ctx.sampleRate || 44100;
  const dur = 0.85;
  const length = Math.max(1, Math.floor(sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const notes = [
    { freq: 261.63, start: 0.00, dur: 0.40, vol: 0.12 }, // Fondamentale chaude C4
    { freq: 523.25, start: 0.00, dur: 0.50, vol: 0.22 }, // C5
    { freq: 659.25, start: 0.035, dur: 0.55, vol: 0.24 }, // E5
    { freq: 783.99, start: 0.070, dur: 0.60, vol: 0.26 }, // G5
    { freq: 1046.50, start: 0.105, dur: 0.72, vol: 0.28 }, // C6
    { freq: 1567.98, start: 0.140, dur: 0.65, vol: 0.16 }, // G6 scintillant
  ];

  for (const note of notes) {
    const startIdx = Math.floor(note.start * sampleRate);
    const noteLen = Math.floor(note.dur * sampleRate);
    let phase = 0;

    for (let i = 0; i < noteLen && startIdx + i < length; i++) {
      const t = i / sampleRate;
      phase += (2 * Math.PI * note.freq) / sampleRate;
      // Attaque ultra-rapide 6ms pour un impact physique instantané dès le drop
      const attack = Math.min(1, t / 0.006);
      const decay = Math.exp(-t * 4.6);
      const sample = Math.sin(phase) * note.vol * attack * decay;
      data[startIdx + i] += sample;
    }
  }

  return buffer;
}

// Lecture instantanée d'un tampon pré-rendu
function playBuffer(getBufferFn, fallbackSynthFn) {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  try {
    const buffer = getBufferFn(ctx);
    if (buffer) {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(masterGain || ctx.destination);
      source.start(0);
      return;
    }
  } catch {
    // Repli synthétisé ci-dessous si la lecture du tampon échoue
  }

  // Repli synthétisé si createBuffer n'est pas supporté (ex: environnement de test jsdom)
  fallbackSynthFn?.(ctx);
}

// 1. Carillon d'accordage Apple (style carillon de fin de timer iOS / fermeture anneau Apple Watch)
export function playAppleChime() {
  playBuffer(
    (ctx) => (buffers.chime ||= buildChimeBuffer(ctx)),
    (ctx) => {
      const now = ctx.currentTime;
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
  );
}

// 2. Micro-clic haptique discret pour boutons tactiles
export function playHapticTick() {
  playBuffer(
    (ctx) => (buffers.haptic ||= buildHapticBuffer(ctx)),
    (ctx) => {
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
  );
}

// 3. Double-ton de transition (passage Focus -> Repos)
export function playPhaseSwitchChime() {
  playBuffer(
    (ctx) => (buffers.phaseSwitch ||= buildPhaseSwitchBuffer(ctx)),
    (ctx) => {
      const now = ctx.currentTime;
      const notes = [587.33, 880.0];
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
  );
}

// 4. Carillon instantané de complétion de tâche (drag-and-drop vers "Terminé")
export function playTaskDoneSound() {
  playBuffer(
    (ctx) => (buffers.taskDone ||= buildTaskDoneCelebrationBuffer(ctx)),
    (ctx) => {
      const now = ctx.currentTime;
      const freqs = [523.25, 659.25, 783.99, 1046.5];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.035);
        gain.gain.setValueAtTime(0.001, now + idx * 0.035);
        gain.gain.linearRampToValueAtTime(0.20, now + idx * 0.035 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.035 + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.035);
        osc.stop(now + idx * 0.035 + 0.6);
      });
    }
  );
}
