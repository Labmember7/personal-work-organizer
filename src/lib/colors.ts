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
