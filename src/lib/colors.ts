export const PROJECT_COLOR_PALETTE = [
  "#4C7EA8", "#D6893C", "#7CA855", "#B15FC9",
  "#35A7A0", "#D6635C", "#C9A63E", "#5B8FD6",
  "#8B6CD9", "#4FAE8E", "#D65C8F", "#8FA83C",
] as const;

// Couleur stable par projet : hachage du nom vers la palette.
export const projectColor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PROJECT_COLOR_PALETTE[Math.abs(hash) % PROJECT_COLOR_PALETTE.length]!;
};

// Nombre de motifs de fond disponibles pour le thème « random » (voir random.css).
export const RANDOM_THEME_PATTERN_COUNT = 4;

/**
 * Jetons du thème « random » : seule la teinte tourne (seed → 0-360°), la
 * structure luminosité/saturation reproduit exactement celle du thème sombre
 * (mêmes L% que tokens.css) pour garantir le même contraste texte/fond quel
 * que soit le tirage.
 */
export const randomThemeVars = (seed: number): Record<string, string> => {
  const hue = Math.floor(seed * 360) % 360;
  const accentHue = (hue + 150) % 360;
  return {
    "--bg": `hsl(${hue} 26% 9%)`,
    "--panel": `hsl(${hue} 22% 14%)`,
    "--panel-alt": `hsl(${hue} 20% 18%)`,
    "--border": `hsl(${hue} 18% 27%)`,
    "--text": `hsl(${hue} 15% 93%)`,
    "--text-dim": `hsl(${hue} 12% 70%)`,
    "--accent": `hsl(${accentHue} 62% 58%)`,
    "--accent-contrast": `hsl(${hue} 22% 8%)`,
    "--inset": `hsl(${hue} 24% 7%)`,
    "--gauge-track": `hsl(${hue} 20% 19%)`,
    "--titlebar-bg": `hsl(${hue} 28% 6%)`,
    "--overlay": `hsla(${hue}, 20%, 4%, 0.7)`,
    "--shadow": `hsla(${hue}, 30%, 3%, 0.4)`,
  };
};

export const randomThemePattern = (seed: number): number =>
  Math.floor(seed * 1000) % RANDOM_THEME_PATTERN_COUNT;
