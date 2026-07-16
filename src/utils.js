// Point d'entrée historique : la logique vit désormais dans src/lib/
// (modules typés). Ce shim évite de réécrire tous les imports existants ;
// les nouveaux fichiers doivent importer directement depuis src/lib/.
export * from "./lib/statuses";
export * from "./lib/time";
export * from "./lib/search";
export * from "./lib/colors";
export * from "./lib/markdown";
export * from "./lib/backup";
export * from "./lib/uid";
