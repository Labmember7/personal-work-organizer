// Images collées dans les descriptions : elles vivent dans data/images/*.jpg
// et ne sont référencées que par l'URL app-image: présente dans le Markdown.
// Rien ne les supprime quand la référence disparaît (description éditée,
// collage annulé, tâche supprimée), d'où le besoin de retrouver les fichiers
// encore utilisés pour effacer les autres (voir images:prune dans main.js).

// Les deux formes que produit l'éditeur : ![alt](app-image://local/x.jpg)
// et <img src="app-image://local/x.jpg" width="…"> (largeur figée).
// Le nom de fichier est un uuid généré par main.js, jamais un chemin.
const IMAGE_REF_REGEX = /app-image:\/\/local\/([\w-]+\.jpg)/gi;

/** Noms de fichiers d'images référencés par les textes donnés, sans doublon. */
export function collectImageRefs(texts: Iterable<string | null | undefined>): string[] {
  const used = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(IMAGE_REF_REGEX)) used.add(match[1]!);
  }
  return [...used];
}
