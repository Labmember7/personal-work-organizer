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

// ── Format `trk.extension/2` : un dossier `plugins/<id>/` avec manifest.json ──
//
// Découverte des dossiers, lecture de la spec déclarative (si le plugin n'a
// qu'une vue déclarative, aucune iframe, aucune origine : l'hôte la rend). La
// validation du manifeste reste côté renderer (`lib/plugins/manifest2.ts`).

// Lit un dossier de plugin v2 : manifest.json obligatoire, et la spec de la
// première vue déclarative (embeddee dans l'entrée pour que l'IPC soit
// autonome, sans aller relire le disque côté renderer).
function readFolderPlugin(dir, origin) {
  let manifestJson;
  try {
    manifestJson = fs.readFileSync(path.join(dir, "manifest.json"), "utf-8");
  } catch {
    return null;
  }
  let id = null;
  let specJson = undefined;
  try {
    const m = JSON.parse(manifestJson);
    id = typeof m.id === "string" ? m.id : null;
    const views = Array.isArray(m.contributes?.views) ? m.contributes.views : [];
    const decl = views.find((v) => v && v.kind === "declarative" && typeof v.spec === "string");
    if (decl) {
      try {
        specJson = fs.readFileSync(path.join(dir, decl.spec), "utf-8");
      } catch {
        specJson = null;
      }
    }
  } catch {
    // manifeste illisible : on garde l'id du nom de dossier ci-dessous
  }
  if (!id) id = path.basename(dir);
  return { id, file: `${id}/manifest.json`, origin, root: dir, manifestJson, specJson };
}

// Liste brute des dossiers plugins (v2) présents dans les racines. Un dossier
// sans manifest.json n'est pas un plugin : ignoré. Idem v1, un dossier absent
// n'est pas une erreur.
function discoverFolders(dirs) {
  const out = [];
  for (const { dir, origin } of dirs) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const plugin = readFolderPlugin(path.join(dir, e.name), origin);
      if (plugin) out.push(plugin);
    }
  }
  return out;
}

// `id -> root` pour le protocole `app-plugin://<id>/…` (main.js).
function pluginRoots(dirs) {
  const map = {};
  for (const f of discoverFolders(dirs)) map[f.id] = f.root;
  return map;
}

// Lit une ressource livrée par un plugin v2, relativement à sa racine, en
// refusant toute traversée de répertoire et tout ce qui sort du dossier
// (lien symbolique inclus, via `realpath`). Renvoie le buffer ou `null`.
function readPluginResource(root, relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) return null;
  if (path.isAbsolute(relPath)) return null;
  if (relPath.split(/[\\/]/).some((seg) => seg === "..")) return null;
  const full = path.resolve(root, relPath);
  try {
    const realRoot = fs.realpathSync(root);
    const realFull = fs.realpathSync(full);
    if (realFull !== realRoot && !realFull.startsWith(realRoot + path.sep)) return null;
    if (!fs.statSync(realFull).isFile()) return null;
    return { data: fs.readFileSync(realFull), full: realFull };
  } catch {
    return null;
  }
}

// CSP par plugin. v1 : mono-fichier sans sous-ressource → `unsafe-inline`
// assumé (cf. ARCHITECTURE.md). v2 : origine par plugin, `'self'` utilisable →
// aucun `unsafe-inline` sur `script-src` (§ 7 de la spec).
//
// Pas de `frame-ancestors` : l'iframe est encadrée par l'hôte (localhost /
// file://), qui n'est pas de la même origine que `app-plugin://<id>`. Le
// confinement vient du sandbox (`allow-scripts allow-same-origin`) et de
// l'origine opaque par plugin, pas d'une restriction d'encadrement qui
// bloquerait le chargement.
const PLUGIN_CSP_V2 =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
  "form-action 'none'; base-uri 'none'";

function buildPluginCsp(format) {
  return format === 2 ? PLUGIN_CSP_V2 : PLUGIN_CSP;
}

const MIME_BY_EXT = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function mimeForPath(p) {
  return MIME_BY_EXT[path.extname(p).toLowerCase()] || "application/octet-stream";
}

module.exports = {
  extractManifestBlock,
  resolvePluginDirs,
  listPlugins,
  discoverFolders,
  pluginRoots,
  readPluginHtml,
  readPluginResource,
  wrapPluginHtml,
  buildPluginCsp,
  mimeForPath,
  PLUGIN_CSP,
};
