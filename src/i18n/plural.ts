// Suffixe pluriel selon la langue :
// - FR : singulier à 0 et 1 (« 0 tâche », « 1 tâche », « 2 tâches ») ;
// - EN : pluriel dès que n ≠ 1 (« 0 tasks », « 1 task », « 2 tasks »).
export const plural = (lang: string, n: number, suffix: string = "s"): string =>
  (lang === "fr" ? n > 1 : n !== 1) ? suffix : "";
