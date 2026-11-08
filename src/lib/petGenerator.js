/**
 * Procedural Cyber Pet Generator
 * Generates a unique, persistent companion for each installation/user.
 * Deterministic PRNG seeding ensures stable traits or unique generation per user.
 */

const STORAGE_KEY = "suivi_travaux_pet_dna";

// ── 1. Palettes thématiques cybernétiques haute définition ──
export const PET_PALETTES = [
  {
    id: "cyber-cyan",
    name: "Cyber Cyan",
    chassisDark: "#050B14",
    chassisMid: "#0A1424",
    chassisLight: "#162842",
    rim: "#93C5FD",
    neon: "#00F5D4",
    glow: "#5EEAD4",
    antenna: "#FF2E93",
    cheek: "#FF3385",
    pupil: "#002B36",
    accentLight: "#38BDF8",
    accentDark: "#0284C7",
  },
  {
    id: "solar-amber",
    name: "Solar Flare",
    chassisDark: "#100B05",
    chassisMid: "#1C1409",
    chassisLight: "#33240F",
    rim: "#FDE68A",
    neon: "#F59E0B",
    glow: "#FCD34D",
    antenna: "#EF4444",
    cheek: "#F97316",
    pupil: "#291800",
    accentLight: "#FBBF24",
    accentDark: "#D97706",
  },
  {
    id: "void-phantom",
    name: "Void Amethyst",
    chassisDark: "#0C0614",
    chassisMid: "#170D28",
    chassisLight: "#2B1849",
    rim: "#E9D5FF",
    neon: "#A855F7",
    glow: "#C084FC",
    antenna: "#EC4899",
    cheek: "#F472B6",
    pupil: "#1B0B33",
    accentLight: "#C084FC",
    accentDark: "#7E22CE",
  },
  {
    id: "matrix-emerald",
    name: "Matrix Jade",
    chassisDark: "#030E08",
    chassisMid: "#071D11",
    chassisLight: "#103520",
    rim: "#A7F3D0",
    neon: "#10B981",
    glow: "#34D399",
    antenna: "#06B6D4",
    cheek: "#059669",
    pupil: "#022413",
    accentLight: "#34D399",
    accentDark: "#047857",
  },
  {
    id: "glacier-frost",
    name: "Glacier Frost",
    chassisDark: "#040D18",
    chassisMid: "#0B1D33",
    chassisLight: "#16345A",
    rim: "#BAE6FD",
    neon: "#38BDF8",
    glow: "#7DD3FC",
    antenna: "#818CF8",
    cheek: "#60A5FA",
    pupil: "#08203D",
    accentLight: "#7DD3FC",
    accentDark: "#0284C7",
  },
  {
    id: "crimson-ruby",
    name: "Crimson Core",
    chassisDark: "#120508",
    chassisMid: "#220A10",
    chassisLight: "#3E141C",
    rim: "#FECDD3",
    neon: "#F43F5E",
    glow: "#FB7185",
    antenna: "#F59E0B",
    cheek: "#FB7185",
    pupil: "#2B050C",
    accentLight: "#FB7185",
    accentDark: "#BE123C",
  },
  {
    id: "sunset-synthwave",
    name: "Synthwave Sunset",
    chassisDark: "#0E071A",
    chassisMid: "#1B0E33",
    chassisLight: "#311B59",
    rim: "#FED7AA",
    neon: "#F43F5E",
    glow: "#FB7185",
    antenna: "#38BDF8",
    cheek: "#FB923C",
    pupil: "#260E3C",
    accentLight: "#F472B6",
    accentDark: "#9333EA",
  },
  {
    id: "quantum-ghost",
    name: "Quantum Ghost",
    chassisDark: "#080F16",
    chassisMid: "#0F1F2C",
    chassisLight: "#1D354A",
    rim: "#FFFFFF",
    neon: "#2DD4BF",
    glow: "#5EEAD4",
    antenna: "#A78BFA",
    cheek: "#34D399",
    pupil: "#061A24",
    accentLight: "#5EEAD4",
    accentDark: "#0F766E",
  },
];

// ── 2. Noms & Archétypes ──
const PET_NAMES = [
  "Nova", "Echo", "Kiko", "Vesper", "Spark", "Astra", "Byte", "Pixel",
  "Nix", "Cosmo", "Lyra", "Orion", "Zephyr", "Rune", "Moxie", "Pip",
  "Neo", "Sol", "Aura", "Tango", "Glitch", "Flux", "Chrono", "Zero",
  "Atlas", "Pico", "Kitsune", "Bao", "Faye", "Mochi"
];

const PET_ARCHETYPES = [
  "Neural Sentinel",
  "Cyber Fox",
  "Quantum Sprite",
  "Chrono Familiar",
  "Plasma Scout",
  "Neon Golem",
  "Star Voyager",
  "Glitch Kitten",
  "Aether Bot",
  "Hyper Familiar",
  "Pulse Druid",
  "Sub-Pixel Sylph",
];

const PET_PERSONALITIES = [
  "Curious & Sub-Pixel Sharp",
  "Quiet Guardian of Focus",
  "Hyperactive & Cheerful",
  "Analytical Neural Sync",
  "Cosmic Dreamer & Drifter",
  "Playful Code Companion",
];

const ANTENNA_TYPES = [
  "pulse_beacon",  // Balise centrale clignotante
  "cat_ears",      // Oreilles félines cyber pointues
  "cyber_horns",   // Cornes holographiques incurvées
  "halo_ring",     // Anneau énergétique flottant
  "dual_antennae", // Deux antennes fines parallèles
];

const EAR_TYPES = [
  "equalizer", // Barres equalizer audio dynamiques
  "cyber_wings", // Ailettes cybernétiques aérodynamiques
  "audio_pods", // Capsules rondes néon
  "armor_fins", // Ailerons d'armure biseautés
];

const EYE_SHAPES = [
  "classic_square", // Carré 4x4 plein
  "soft_corners",   // Coins adoucis
  "visor_strip",    // Regard large fente stylisée
];

// PRNG pour consistance

function createRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Génère un ADN de pet complet à partir d'une graine aléatoire ou donnée
 */
export function generatePetDna(customSeed = null) {
  const seed = customSeed || Math.floor(Math.random() * 1000000000);
  const rng = createRng(seed);

  const nameIndex = Math.floor(rng() * PET_NAMES.length);
  const archetypeIndex = Math.floor(rng() * PET_ARCHETYPES.length);
  const personalityIndex = Math.floor(rng() * PET_PERSONALITIES.length);
  const paletteIndex = Math.floor(rng() * PET_PALETTES.length);
  const antennaIndex = Math.floor(rng() * ANTENNA_TYPES.length);
  const earIndex = Math.floor(rng() * EAR_TYPES.length);
  const eyeIndex = Math.floor(rng() * EYE_SHAPES.length);

  const hasForeheadGem = rng() > 0.55;

  return {
    id: `pet-${seed.toString(36)}`,
    seed,
    name: PET_NAMES[nameIndex],
    archetype: PET_ARCHETYPES[archetypeIndex],
    personality: PET_PERSONALITIES[personalityIndex],
    palette: PET_PALETTES[paletteIndex],
    antennaType: ANTENNA_TYPES[antennaIndex],
    earType: EAR_TYPES[earIndex],
    eyeShape: EYE_SHAPES[eyeIndex],
    hasForeheadGem,
    created: Date.now(),
    version: 1,
  };
}

/**
 * Récupère le pet unique persisté dans localStorage, ou en génère un nouveau
 */
export function getOrCreatePetDna() {
  if (typeof window === "undefined" || !window.localStorage) {
    return generatePetDna(1337);
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.palette && parsed.name && parsed.antennaType) {
        return parsed;
      }
    }
  } catch {
    // Ignore storage parse errors
  }

  const newPet = generatePetDna();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newPet));
  } catch {
    // Storage write fail safe
  }
  return newPet;
}

/**
 * Réinitialise / Régénère un nouveau pet unique pour l'utilisateur
 */
export function regeneratePetDna() {
  const newPet = generatePetDna();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newPet));
    } catch {
      // safe
    }
  }
  return newPet;
}

