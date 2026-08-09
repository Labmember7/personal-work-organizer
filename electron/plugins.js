const fs = require("fs");
const path = require("path");

// Découverte et service des plugins HTML déposés dans `plugins/`.
//
// Aucune validation de manifeste ici : ce module se contente d'extraire le
// bloc brut et de servir le fichier. La validation (schéma, apiVersion,
// capacités) vit dans `src/lib/plugins/manifest.ts`, côté renderer — c'est la
// seule source de vérité pour ce qui rend un plugin utilisable ou non.

// ⚠️ Cette regex DOIT rester identique à `MANIFEST_RE` dans
// `src/lib/plugins/manifest.ts` (extractManifestBlock). Un écart entre les
// deux ferait qu'un plugin serait vu différemment par le processus principal
// et par le renderer. `electron/plugins.test.js` vérifie la non-régression.
const MANIFEST_RE = /<script[^>]*\bid=["']trk-plugin["'][^>]*>([\s\S]*?)<\/script>/i;

function extractManifestBlock(html) {
  const found = MANIFEST_RE.exec(html);
  if (!found) return null;
  const body = found[1];
  if (body === undefined) return null;
  const trimmed = body.trim();
  return trimmed ? trimmed : null;
}

// `builtin` = livré avec l'app (à côté de main.js) ; `user` = déposé par
// l'utilisateur à côté de l'exécutable. Un plugin `user` du même id écrasera
// un plugin `builtin` — arbitré côté renderer (services/plugins.ts), pas ici.
function resolvePluginDirs(baseDir, appDir) {
  return [
    { dir: path.join(appDir, "plugins"), origin: "builtin" },
    { dir: path.join(baseDir, "plugins"), origin: "user" },
  ];
}

// Liste brute, non validée : { file, origin, manifestJson, error? }.
// Un dossier absent n'est pas une erreur (ex: pas de plugin "user" déposé).
function listPlugins(dirs) {
  const entries = [];
  for (const { dir, origin } of dirs) {
    let files;
    try {
      files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".html"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const html = fs.readFileSync(path.join(dir, file), "utf-8");
        const manifestJson = extractManifestBlock(html);
        entries.push(manifestJson ? { file, origin, manifestJson } : { file, origin, manifestJson: null, error: "no-manifest" });
      } catch {
        entries.push({ file, origin, manifestJson: null, error: "unreadable" });
      }
    }
  }
  return entries;
}

// Lit le HTML d'un plugin par nom de fichier. Même garde que `app-image` pour
// `main.js` : refuse tout ce qui n'est pas un simple nom de fichier avant de
// toucher au disque (pas de "..", pas de séparateur de chemin).
function readPluginHtml(dirs, file) {
  if (!/^[\w-]+\.html$/.test(file)) return null;
  // Les dossiers sont parcourus dans l'ordre de `resolvePluginDirs`
  // (builtin puis user) : un fichier "user" de même nom écrase le builtin.
  let found = null;
  for (const { dir } of dirs) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) {
      try {
        found = { html: fs.readFileSync(full, "utf-8"), dir };
      } catch {
        // fichier illisible : on garde le dernier résultat valide trouvé
      }
    }
  }
  return found;
}

// Servie avec chaque document de plugin. Le confinement vient du sandbox
// (origine opaque, cf. main.js) et de `connect-src 'none'`, pas de cette CSP
// seule : `'unsafe-inline'` est assumé pour un modèle mono-fichier sans
// sous-ressource (cf. ARCHITECTURE.md, section sécurité).
const PLUGIN_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: blob:; font-src data:; connect-src 'none'; " +
  "form-action 'none'; base-uri 'none'";

// Injecte le SDK en ligne (jamais en sous-ressource, la CSP interdit
// `script-src` autre que 'unsafe-inline') avant tout script du plugin, pour
// que `window.TrkPlugin` soit disponible dès la première ligne exécutée.
function wrapPluginHtml(html, sdkSource) {
  const inject = `<meta charset="utf-8">\n<script>${sdkSource}</script>\n`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (tag) => `${tag}\n${inject}`);
  }
  // Pas de <head> dans ce plugin minimal : on injecte en tête du document.
  return inject + html;
}

module.exports = {
  extractManifestBlock,
  resolvePluginDirs,
  listPlugins,
  readPluginHtml,
  wrapPluginHtml,
  PLUGIN_CSP,
};
