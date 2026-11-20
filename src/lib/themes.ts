export type ThemeId =
  | "dark"
  | "light"
  | "nebula"
  | "forest"
  | "synth"
  | "sand"
  | "random";

export type SculptureId =
  | "mosaic"
  | "dawn"
  | "starchart"
  | "bloom"
  | "harmony"
  | "cairn";

export interface ThemeMeta {
  id: ThemeId;
  isLight: boolean;
  sculpture: SculptureId | "auto";
  swatchBg: string;
  swatchAccent: string;
  swatchSecondary: string;
  labelKey: string;
  sculptureKey: string;
}

export const CURATED_SCULPTURES: readonly SculptureId[] = [
  "mosaic",
  "dawn",
  "starchart",
  "bloom",
  "harmony",
  "cairn",
] as const;

export const THEMES: readonly ThemeMeta[] = [
  {
    id: "dark",
    isLight: false,
    sculpture: "mosaic",
    swatchBg: "#181C24",
    swatchAccent: "#35A7A0",
    swatchSecondary: "#E5B869",
    labelKey: "prefs_theme_dark",
    sculptureKey: "sculpture_mosaic",
  },
  {
    id: "light",
    isLight: true,
    sculpture: "dawn",
    swatchBg: "#DBD5CB",
    swatchAccent: "#1E7C76",
    swatchSecondary: "#D9913B",
    labelKey: "prefs_theme_light",
    sculptureKey: "sculpture_dawn",
  },
  {
    id: "nebula",
    isLight: false,
    sculpture: "starchart",
    swatchBg: "#121526",
    swatchAccent: "#818CF8",
    swatchSecondary: "#38BDF8",
    labelKey: "prefs_theme_nebula",
    sculptureKey: "sculpture_starchart",
  },
  {
    id: "forest",
    isLight: false,
    sculpture: "bloom",
    swatchBg: "#141E1B",
    swatchAccent: "#34D399",
    swatchSecondary: "#A3E635",
    labelKey: "prefs_theme_forest",
    sculptureKey: "sculpture_bloom",
  },
  {
    id: "synth",
    isLight: false,
    sculpture: "harmony",
    swatchBg: "#1A1B20",
    swatchAccent: "#F59E0B",
    swatchSecondary: "#FB7185",
    labelKey: "prefs_theme_synth",
    sculptureKey: "sculpture_harmony",
  },
  {
    id: "sand",
    isLight: true,
    sculpture: "cairn",
    swatchBg: "#D8CDBC",
    swatchAccent: "#9E4728",
    swatchSecondary: "#B88842",
    labelKey: "prefs_theme_sand",
    sculptureKey: "sculpture_cairn",
  },
  {
    id: "random",
    isLight: false,
    sculpture: "auto",
    swatchBg: "#1E1B2E",
    swatchAccent: "#C084FC",
    swatchSecondary: "#38BDF8",
    labelKey: "prefs_theme_random",
    sculptureKey: "sculpture_random",
  },
] as const;

export const THEME_ORDER: readonly ThemeId[] = THEMES.map((t) => t.id);

export function isValidTheme(value: string | null | undefined): value is ThemeId {
  return THEME_ORDER.includes(value as ThemeId);
}

export function isLightTheme(theme: string | null | undefined): boolean {
  return theme === "light" || theme === "sand";
}

export function getThemeMeta(theme: string | null | undefined): ThemeMeta {
  return THEMES.find((t) => t.id === theme) ?? THEMES[0]!;
}

export function getNextTheme(current: string | null | undefined): ThemeId {
  const idx = THEME_ORDER.indexOf(current as ThemeId);
  if (idx < 0) return THEME_ORDER[0]!;
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length]!;
}

export function getSculptureForTheme(
  theme: string | null | undefined,
  randomSeed = 0
): SculptureId {
  const meta = getThemeMeta(theme);
  if (meta.sculpture !== "auto") return meta.sculpture;
  const idx = Math.abs(Math.floor(randomSeed * 997)) % CURATED_SCULPTURES.length;
  return CURATED_SCULPTURES[idx]!;
}
