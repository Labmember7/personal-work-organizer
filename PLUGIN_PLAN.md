# Plan d'exécution — Système de plugins + refonte de la carte mentale

> Document de passation. Il est **auto-suffisant** : tout ce qui suit a déjà été
> vérifié dans le dépôt. Ne pas re-explorer le code pour retrouver ces faits.
> Lire ce fichier, puis exécuter la section « Ordre d'exécution ».

---

## 1. Demande

Ajouter un système de plugins générique et facilement extensible, capable
d'accueillir des outils comme la carte mentale / feuille de route, reliés au
système de tickets et de projets existant. Concevoir un format de données pour
une intégration transparente. Refactorer
`plugins/feuille-de-route-web-configurateurs.html` vers ce format et l'intégrer.

### Deux décisions arbitrées par l'utilisateur — NON négociables

| Décision | Choix retenu | Conséquence |
|---|---|---|
| Modèle d'hébergement | **HTML chargé à l'exécution dans une iframe** | Un plugin = un fichier `.html` autonome déposé dans `plugins/`, sans recompilation. Pas de plugin compilé dans le bundle. Communication uniquement par `postMessage`. |
| Liens vers les entités | **Référence en lecture seule** | Un nœud peut pointer une tâche existante et afficher son statut réel, mais un plugin **ne crée jamais et ne modifie jamais** une tâche. Aucun canal de mutation dans le protocole. |

`plugin:task:reveal` (ouvrir une tâche dans l'app) est de la navigation, pas une
mutation : il est autorisé.

---

## 2. Directives de travail

- **Commentaires et libellés en français**, comme tout le dépôt. Commenter le
  *pourquoi*, jamais le *quoi*. Densité de commentaires : voir `useTasks.ts`.
- **TypeScript strict** pour toute la logique (`src/lib/**`, `src/services/**`,
  hooks `use*.ts`). `tsconfig.json` : `strict`, **`noUncheckedIndexedAccess`**,
  `isolatedModules`, `allowJs: false`, `include: ["src/**/*.ts","src/**/*.tsx"]`.
  → tout `arr[i]` et `obj[k]` rend `T | undefined`, il faut garder.
  → `import type { … }` pour les types (isolatedModules).
- **Composants en `.jsx`** (pas de `.tsx` dans ce dépôt hors `i18n/index.tsx`).
  Ils importent les types uniquement via les hooks TS.
- **Petites fonctions ciblées.** Ne pas réécrire du code qui marche.
- **CSS** : préfixe `trk-`, une feuille par domaine dans `src/styles/`, ajoutée
  à `src/styles/index.css` (**l'ordre des `@import` est significatif**).
  Utiliser exclusivement les jetons de `tokens.css`, jamais de couleur en dur.
- **i18n** : toute chaîne visible passe par `t("clé")`. Ajouter chaque clé dans
  **`src/i18n/fr.ts` ET `src/i18n/en.ts`** (mêmes clés, sinon repli silencieux
  sur le fr). Préfixer les nouvelles clés `plugin_*`.
- **Tests** : Vitest. Un `*.test.ts` par module pur ajouté.
- **Interdictions de l'environnement** : ne pas tuer de processus, ne pas
  toucher un fichier hors du dossier de travail, ne pas manipuler le système.
  Demander avant toute commande nécessitant une approbation.
- **Fin de tâche** : `npm run typecheck && npm run lint && npm test` doivent
  passer. Puis ajouter une puce (< 15 mots) dans `~/ClaudeMemory/Sessions/`.
- Mettre à jour `ARCHITECTURE.md` (nouveau module, nouveau contrat IPC, section
  sécurité, schéma de stockage).

---

## 3. Faits établis sur le dépôt (ne pas revérifier)

### Pile
Electron 31 + React 18.3 + Vite 5 + Vitest 2. App de bureau portable
(`SuiviTravaux`). Pas de routeur : une seule page, l'état `viewMode` commute les
vues. `lucide-react` pour les icônes. Aucune ressource distante, CSP stricte.

### Processus principal — `main.js` (CommonJS)
| Élément | Emplacement / signature |
|---|---|
| `resolveBaseDir()` | Dossier de l'exécutable. Gère `process.env.APPIMAGE`, `PORTABLE_EXECUTABLE_DIR`, `app.isPackaged`, sinon `__dirname`. |
| `getDataDir()` | Essaie `<baseDir>/data` puis `<userData>/data`, teste `W_OK`, met en cache, journalise. |
| Scheme privilégié | `protocol.registerSchemesAsPrivileged([{scheme:"app-image", privileges:{standard,secure,supportFetchAPI,stream,bypassCSP}}])` — **avant `app.whenReady()`**, l. 13-18. |
| `protocol.handle("app-image", …)` | Dans `app.whenReady()`, l. 303. Valide `^[\w-]+\.jpg$` avant de toucher au disque. |
| Gardes de navigation | l. 271-278 : `will-navigate` refuse tout, `setWindowOpenHandler` → `deny`, liens `http(s)` vers le navigateur système. |
| `webPreferences` | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. |
| Handlers IPC existants | `storage:get/set/delete/list`, `config:getProjects/setProjects`, `images:save/prune`, `data:export/import`, `window:*`. |
| Journal | `logger.log(...)` depuis `electron/logger.js`. |

### `electron/store.js`
Store clé/valeur JSON. API : `get(key)`, `set(key, value)`, `delete(key)`,
**`keys(prefix)`** (filtre par préfixe), `flush()`. Écriture atomique
(tmp + rename), debounce 200 ms, copie `.bak`.

### `preload.js`
`contextBridge.exposeInMainWorld` pour `storage`, `config`, `dataIO`, `images`,
`windowControls`. Surface minimale, pas de Node dans le renderer.

### `vite.config.js`
CSP injectée **au build uniquement** (pas en dev, HMR l'exige), dans le
remplacement de `<meta charset="UTF-8" />`. Tableau `CSP` l. 8-16 :
`default-src 'self'` / `script-src 'self'` / `style-src 'self' 'unsafe-inline'` /
`img-src 'self' data:` / `font-src 'self' data:` / `connect-src 'self'` /
`object-src 'none'`.

### `src/services/storage.ts`
```ts
loadValue<T>(key): Promise<T | null>      // IPC ou localStorage, tolérant (null si erreur)
saveValue(key, value): Promise<boolean>   // false si échec
pruneUnusedImages(usedFiles): Promise<void>
loadConfigProjects(): Promise<Project[] | null>
syncConfigProjects(projects): Promise<void>
```
Préfixe du repli navigateur : `LOCAL_PREFIX = "trk-store:"`. `hasIpc()` teste
`!!window.storage`. Le bloc `declare global { interface Window { … } }` qui type
`window.storage / config / dataIO / images / windowControls` est **ici**.
→ **`listKeys` et `deleteValue` n'existent pas encore : à ajouter.**

### `src/features/tasks/useTasks.ts`
Source de vérité. `STORAGE_KEY = "suivi-travaux-data"`, valeur
`{ tasks, projects }`. Interface publique `TaskStore` : `loading, tasks,
projects, saveError, tasksRef, projectsRef, saveTasks, saveProjects, saveBoth,
upsertTask, deleteTask, archiveTask, unarchiveTask, moveTask, addTimeLog,
editTimeLog, deleteTimeLog, canUndo, canRedo, undo, redo`.
**Le système de plugins n'appelle AUCUNE de ces mutations** (lecture seule).

### `src/lib/types.ts`
```ts
Task { id, type?: "standard"|"simple", titre, projet, description?, priorite?,
       statut?, assigne?, dateDebut?, echeance?, timeLogs?: TimeLog[], archived? }
TimeLog { id, minutes, note, date }
Project = string
```

### `src/lib/statuses.ts`
`statusOf(id)` → `{ id, label, weight, color }` (repli `STATUSES[0]`).
`prioOf(id)` → `{ id, label, color, order }` (repli « moyenne »).
`isTaskDone(task)`, `isDoneStatus(id)`, `statusesForTask(task)`,
`STATUSES` (6, poids 0→100), `SIMPLE_STATUSES` (3), `PRIORITIES` (4).

### `src/lib/uid.ts` → `uid(): string` (UUID natif, repli horodatage+aléa).

### i18n — `src/i18n/index.tsx`
`useLang()` → `{ lang: "fr"|"en", setLang, t, locale }`. `t(key)` cherche dans
`dict[lang]`, replis `dict.fr`, puis rend la clé. Dictionnaires
`src/i18n/{fr,en}.ts` : `export default { clé: "texte", … }` plat.
`src/i18n.jsx` est un shim de ré-export — **les composants importent
`"../../i18n.jsx"`**, garder cette convention.

### `src/App.jsx` — points d'insertion exacts
| Ligne | Contenu |
|---|---|
| 45 | `const [viewMode, setViewMode] = useState("list");` |
| 101-102 | `const store = useTasks({...})` ; `const { loading, tasks, projects, saveError } = store;` |
| 241 | `const openEditTask = (task) => setEditing({ ...task });` → à passer au plugin pour `task:reveal` |
| 352-363 | `<TaskToolbar … viewMode onViewChange … />` |
| 365-407 | Chaîne ternaire `viewMode === "kanban" ? … : viewMode === "archived" ? … : <TaskList/>` → **ajouter une branche `"plugins"`** |
| 411 | `<ChartsSection …/>` |
| 48 / 452 | `toast` state + `<Toast toast={toast} />` → réutiliser pour `plugin:toast` |

### `src/features/tasks/TaskToolbar.jsx`
Trois boutons dans `.trk-view-switch` : `list` (icône `List`), `kanban`
(`Columns3`), `archived` (`Archive`). Motif à copier tel quel pour un 4ᵉ bouton
`plugins` (icône `Puzzle`), avec `title`, `aria-pressed` et
`<span className="trk-view-label">`.

### Thème
`theme` ∈ `dark | light | random` + `stickyMode` booléen, classes posées sur
`.trk-app`. Jetons dans `src/styles/tokens.css` : `--bg --panel --panel-alt
--border --text --text-dim --accent --accent-contrast --inset --gauge-track
--overlay --shadow --danger --warn --ok`, `--space-1..5`, `--control-h`,
`--control-h-sm`, `--radius-sm/md/lg`, `--board-h`, `--toolbar-h`.
`.trk-app.light` redéfinit les couleurs. Le thème `random` injecte des variables
en `style=` inline via `randomThemeVars(seed)`.

### `package.json`
`build.files` = `["dist/**/*", "main.js", "preload.js", "electron/**/*",
"!electron/**/*.test.js"]` → **ajouter `"plugins/**/*"`**.
Scripts : `dev`, `build`, `start`, `test` (`vitest run`), `typecheck`
(`tsc --noEmit`), `lint`, `format`.

### ESLint (`eslint.config.js`)
`src/**` = globals navigateur + react/react-hooks. `main.js`, `preload.js`,
`electron/**/*.js` = **commonjs + globals Node**. `electron/**/*.test.js` = ESM.
`react-hooks/exhaustive-deps` en `warn`.

---

## 4. Architecture retenue

```
plugins/                        ← déposé par l'utilisateur, à côté de l'exécutable
  mindmap.html                    (un fichier = un plugin, manifeste embarqué)

Electron main
  registerSchemesAsPrivileged("app-plugin")   standard + secure, PAS bypassCSP
  protocol.handle("app-plugin")               sert le HTML + injecte le SDK + CSP dédiée
  ipc plugins:list                            découverte (manifeste brut, non validé)
  ipc plugins:saveFile                        export via dialogue natif

Renderer (hôte)
  services/plugins.ts        découverte (IPC | repli glob), URL d'iframe, saveFile
  lib/plugins/*.ts           types, manifeste, document, pont, projection  ← logique pure
  features/plugins/          hook de pont + UI (liste, sélecteur de doc, iframe)

Plugin (iframe sandbox="allow-scripts", origine opaque)
  window.TrkPlugin           SDK injecté par l'hôte, jamais chargé par le plugin
```

### Chaîne de confiance
1. L'iframe est `sandbox="allow-scripts"` → **origine opaque**, pas de
   `localStorage`, pas de DOM parent, pas de navigation, pas de formulaire.
2. La CSP servie avec le document du plugin coupe le réseau
   (`default-src 'none'; connect-src 'none'`).
3. Le plugin n'a **aucun** accès disque ni IPC. Il ne voit que ce que l'hôte lui
   envoie, filtré par les capacités de son manifeste.
4. L'hôte valide chaque message entrant : `event.source`, `ns`, `protocol`,
   `pluginId`, type, puis capacité accordée.
5. Aucun message de mutation n'existe dans le protocole.

### Pièges déjà identifiés — ne pas les redécouvrir

| Piège | Résolution |
|---|---|
| Une CSP `<meta>` s'applique aussi à `srcdoc` (même origine) → les scripts inline du plugin seraient bloqués. | **Ne jamais utiliser `srcdoc`.** Servir le plugin via le scheme `app-plugin`, qui a son propre document et sa propre CSP d'en-tête. |
| `default-src 'self'` implique `frame-src 'self'` → l'iframe `app-plugin://` est bloquée. | Ajouter `"frame-src 'self' app-plugin:"` au tableau `CSP` de `vite.config.js`. |
| Avec une origine opaque, `script-src 'self'` ne matche rien → un `<script src>` du plugin échoue. | **Injecter le SDK en ligne** dans le HTML au moment de le servir. Aucune sous-ressource. CSP `script-src 'unsafe-inline'`. |
| `event.origin` vaut `"null"` pour une iframe sandboxée → inutilisable pour authentifier. | Authentifier par `event.source === iframeRef.current.contentWindow`. |
| `bypassCSP: true` ferait ignorer la CSP de la page par les réponses du scheme. | Ne **pas** le mettre pour `app-plugin`. `standard: true` est indispensable (origine correcte, résolution des URL relatives). |
| Une iframe sandboxée ne peut pas déclencher de téléchargement. | Les exports passent par `plugin:file:save` → `dialog.showSaveDialog`. |
| Le repli `localStorage` de `storage.ts` n'a pas de `list`. | Implémenter `listKeys` avec itération sur `localStorage` filtrée par `trk-store:` + préfixe. |
| Hors Electron (`npm run dev`), pas d'IPC. | Repli : URL d'iframe `/plugins/<fichier>` (Vite sert la racine du projet, et il n'y a pas de CSP en dev) + découverte par `import.meta.glob("/plugins/*.html", { query: "?raw", import: "default", eager: true })`. |
| `noUncheckedIndexedAccess` | Garder tout accès indexé : `const x = arr[i]; if (!x) return;`. |

---

## 5. Format de données (déjà écrit, ne pas redéfinir)

### Enveloppe générique — commune à tous les plugins
```ts
PLUGIN_DOC_SCHEMA = "trk.plugin.doc/1"

PluginDocument<TData> {
  schema: "trk.plugin.doc/1"
  pluginId: string
  pluginVersion?: string
  dataVersion: number            // versionné par le plugin, pour ses migrations
  id: string
  title: string
  scope: { kind: "global" } | { kind: "project"; project: string }
  refs: EntityRef[]              // liens lecture seule
  createdAt: string
  updatedAt: string
  data: TData                    // opaque pour l'hôte
}
EntityRef { kind: "task" | "project"; id: string }
```
Seul `data` appartient au plugin. L'hôte gère le reste → la liste des
documents, la portée projet, les liens et le stockage sont réutilisables sans
une ligne de code par plugin.

**Clé de stockage : `plugin-doc:<pluginId>:<docId>`**, énumérée par
`storage:list("plugin-doc:")`.

### Manifeste — embarqué dans le HTML du plugin
```html
<script type="application/json" id="trk-plugin">
{ "id": "mindmap", "version": "1.0.0", "apiVersion": 1,
  "name": { "fr": "Carte mentale", "en": "Mind map" },
  "description": { "fr": "…", "en": "…" },
  "icon": "Network",
  "capabilities": ["doc", "tasks:read", "task:reveal", "file:save", "toast"],
  "scopes": ["global", "project"] }
</script>
```

### Protocole — `ns: "trk.plugin"`, `protocol: 1`
Enveloppe dans les deux sens : `{ ns, protocol, pluginId, message }`.

| Hôte → plugin | Charge |
|---|---|
| `host:init` | `apiVersion, plugin{id,version}, lang, dict, theme, capabilities, doc, snapshot` |
| `host:doc` | `doc` (changement de document, rechargement) |
| `host:snapshot` | `snapshot { tasks, projects }` |
| `host:theme` | `theme { name, dark, tokens }` |
| `host:lang` | `lang, dict` |
| `host:saved` | `at` |
| `host:error` | `code, message` |

| Plugin → hôte | Charge | Capacité requise |
|---|---|---|
| `plugin:ready` | `apiVersion` | — |
| `plugin:doc:save` | `patch { data, dataVersion?, title?, refs? }` | `doc` |
| `plugin:dirty` | `dirty` | `doc` |
| `plugin:snapshot:refresh` | — | `tasks:read` |
| `plugin:task:reveal` | `id` | `task:reveal` |
| `plugin:toast` | `message` | `toast` |
| `plugin:file:save` | `name, mime, base64? \| text?` | `file:save` |

### Projection en lecture seule d'une tâche
```ts
TaskProjection {
  id, titre, projet,
  statut, statutLabel, statutColor, weight,      // résolus par l'hôte via statuses.ts
  priorite, prioriteLabel, prioriteColor,
  assigne, dateDebut, echeance,
  archived, done, minutes                         // minutes = somme des timeLogs
}
HostSnapshot { tasks: TaskProjection[], projects: string[] }
```
Les libellés et couleurs sont résolus côté hôte : un plugin affiche l'état réel
sans dupliquer `lib/statuses.ts` et suit toute évolution du référentiel.

---

## 6. Inventaire des fichiers

### Déjà écrits — ne pas réécrire
| Fichier | Contenu |
|---|---|
| `src/lib/plugins/types.ts` | Constantes `PLUGIN_API_VERSION = 1`, `PLUGIN_MESSAGE_NS = "trk.plugin"`, `PLUGIN_CAPABILITIES`, `PLUGIN_DOC_SCHEMA`. Types `PluginCapability, LocalizedText, PluginScopeKind, PluginManifest, PluginSource, PluginLoadError, PluginDocScope, EntityRef, PluginDocument, PluginDocSummary, TaskProjection, HostSnapshot, HostTheme, HostInitMessage, HostMessage, PluginDocPatch, PluginMessage, PluginEnvelope`. |
| `src/lib/plugins/manifest.ts` | `MANIFEST_TAG_ID`, `extractManifestBlock(html)`, `parseManifest(json): ManifestResult`, `localized(text, lang)`, `scopesOf(manifest)`, `hasCapability(manifest, cap)`. Validation : `id` `^[a-z0-9][a-z0-9-]{0,39}$`, `name` requis, `apiVersion` entier ≥ 1 et ≤ `PLUGIN_API_VERSION` (sinon `api-too-new`), `capabilities` tableau (entrées inconnues ignorées, pas fatales). |

### À écrire

#### Logique pure — `src/lib/plugins/`
| Fichier | Exports attendus |
|---|---|
| `document.ts` | `docStorageKey(pluginId, docId)`, `DOC_KEY_PREFIX = "plugin-doc:"`, `parseDocKey(key)`, `createDocument({pluginId, pluginVersion, title, scope, dataVersion, data})`, `isPluginDocument(v): v is PluginDocument`, `normalizeDocument(raw, pluginId)` (complète les champs manquants, rejette une enveloppe d'un autre plugin, dédoublonne `refs`), `applyPatch(doc, patch)` (rend un nouveau doc avec `updatedAt` rafraîchi ; ignore un `title` vide), `summaryOf(doc)`, `docMatchesScope(doc, project \| null)`. |
| `bridge.ts` | `encode(pluginId, message): PluginEnvelope`, `decodeHostMessage(raw)`, `decodePluginMessage(raw, pluginId, capabilities): PluginMessage \| null` — vérifie `ns`, `protocol === PLUGIN_API_VERSION`, `pluginId`, forme du message, **et la capacité requise** ; rend `null` sinon. `capabilityFor(type): PluginCapability \| null`. Ne lève jamais. |
| `projection.ts` | `projectTask(task): TaskProjection` (utilise `statusOf`, `prioOf`, `isTaskDone`, somme des `timeLogs`), `projectSnapshot(tasks, projects): HostSnapshot`, `themeSnapshot(themeName, dark, el?): HostTheme` (lit les jetons calculés sur `.trk-app` via `getComputedStyle`, repli sur une table statique si pas de DOM). |
| `document.test.ts` | Enveloppe créée conforme ; `normalizeDocument` répare un doc tronqué, refuse un `pluginId` étranger ; `applyPatch` met à jour `updatedAt` et conserve `createdAt`. |
| `bridge.test.ts` | Rejet : mauvais `ns`, mauvais `protocol`, mauvais `pluginId`, type inconnu, **capacité non accordée**. Acceptation d'un message valide. |
| `manifest.test.ts` | `extractManifestBlock` sur du HTML réaliste ; `parseManifest` : id invalide, `name` absent, `apiVersion` trop récente → `api-too-new`, capacité inconnue ignorée. |
| `projection.test.ts` | Somme des minutes ; libellés/couleurs résolus ; tâche archivée et terminée marquées. |

#### Services et hooks
| Fichier | Rôle |
|---|---|
| `src/services/storage.ts` *(modifier)* | Ajouter `listKeys(prefix): Promise<string[]>` et `deleteValue(key): Promise<boolean>`, avec repli `localStorage` (itérer les clés, filtrer `LOCAL_PREFIX + prefix`, retirer le préfixe). Étendre `declare global` avec `window.plugins?: { list(): Promise<RawPluginEntry[]>; saveFile(f): Promise<{canceled:boolean; filePath?:string}> }`. |
| `src/services/plugins.ts` | `discoverPlugins(): Promise<{ plugins: PluginSource[]; errors: PluginLoadError[] }>`. Chemin Electron : `window.plugins.list()` → entrées `{ file, origin, manifestJson, error? }` → `parseManifest` → `url = "app-plugin://local/" + file`. Repli navigateur : `import.meta.glob("/plugins/*.html", { query: "?raw", import: "default", eager: true })` → `extractManifestBlock` → `parseManifest` → `url = "/plugins/" + file`. **Un plugin `user` écrase un plugin `builtin` de même `id`.** Plus `savePluginFile(payload)` (IPC, sinon repli téléchargement `Blob` en dev). |
| `src/features/plugins/usePluginDocs.ts` | CRUD des documents d'un plugin sur `services/storage`. Expose `{ loading, docs: PluginDocSummary[], activeId, activeDoc, selectDoc, createDoc(title, scope), renameDoc, deleteDoc, saveActive(patch), saving, saveError }`. Écriture **debounce ~400 ms** (un plugin envoie `doc:save` à chaque frappe), avec flush au changement de document et au démontage. Charge par `listKeys(DOC_KEY_PREFIX + pluginId + ":")` puis `loadValue` de chaque clé, `normalizeDocument`, tri par `updatedAt` décroissant. |
| `src/features/plugins/usePluginHost.ts` | Le pont. Prend `{ plugin, doc, snapshot, theme, lang, dict, onDocPatch, onRevealTask, onToast }`. Rend `{ iframeRef, ready, post }`. Écoute `message` sur `window`, **authentifie `event.source === iframeRef.current.contentWindow`**, décode via `bridge.decodePluginMessage` avec les capacités du manifeste, dispatche. Envoie `host:init` sur `plugin:ready`, puis `host:doc` / `host:snapshot` / `host:theme` / `host:lang` quand les entrées changent. Nettoie l'écouteur au démontage. |

#### UI — `src/features/plugins/`
| Fichier | Rôle |
|---|---|
| `PluginsSection.jsx` | La vue. Si aucun plugin : `EmptyState` expliquant qu'il faut déposer un `.html` dans `plugins/` (+ liste des `errors` de chargement). Sinon : barre de sélection du plugin (icône lucide dynamique via le nom du manifeste, repli `Puzzle`), `PluginDocBar`, puis `PluginFrame`. `HelpTip tipKey="plugins"` pour rester cohérent. |
| `PluginDocBar.jsx` | Liste déroulante des documents, bouton « nouveau », renommer en ligne, supprimer avec confirmation (motif `confirm` de `TaskRow`), sélecteur de portée (global / projet, limité par `scopesOf`). Masquée si `manifest.singleton`. |
| `PluginFrame.jsx` | L'`<iframe>` : `ref={iframeRef}`, `src={plugin.url}`, `sandbox="allow-scripts"`, `title` = nom du plugin, `allow=""`, `referrerPolicy="no-referrer"`. Remonte un état de chargement et un message d'erreur si `plugin:ready` n'arrive pas (délai ~5 s). |
| `src/styles/plugins.css` | Jetons uniquement. Iframe en `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)`, hauteur `var(--board-h)` minimum, fond `var(--inset)`. Ajouter `@import "./plugins.css";` dans `index.css` **après `views.css`**. |

#### Electron
| Fichier | Rôle |
|---|---|
| `electron/plugins.js` | CommonJS. `resolvePluginDirs(baseDir, appDir)` → `[{dir, origin:"builtin"}, {dir, origin:"user"}]`. `listPlugins(dirs)` → pour chaque `*.html` : lit le fichier, extrait le bloc manifeste (**même regex que `manifest.ts`, commentaire de renvoi obligatoire**), rend `{ file, origin, manifestJson, error }`. Ne valide pas (la validation vit dans `manifest.ts`). `readPluginHtml(dirs, file)` → refuse tout nom hors `^[\w-]+\.html$` (même garde que `app-image`), rend `{ html, dir }` ou `null`. `PLUGIN_CSP` (constante) et `wrapPluginHtml(html, sdkSource)` qui injecte `<meta charset>` + le SDK en ligne **avant** le HTML du plugin. |
| `electron/plugins.test.js` | ESM + Vitest, sur un dossier temporaire. Découverte des deux racines ; priorité `user` sur `builtin` ; refus d'un nom de fichier avec `../` ; extraction du manifeste ; **test de non-régression : la regex de `electron/plugins.js` et `extractManifestBlock` de `src/lib/plugins/manifest.ts` donnent le même résultat sur `plugins/mindmap.html`.** |
| `main.js` *(modifier)* | 1. Ajouter `app-plugin` au tableau `registerSchemesAsPrivileged` : `{ standard: true, secure: true, supportFetchAPI: true }` — **pas** `bypassCSP`. 2. `getPluginDirs()` sur le motif de `getDataDir()` (`<baseDir>/plugins` créé si absent, + `<__dirname>/plugins` en builtin). 3. `ipcMain.handle("plugins:list", …)` et `ipcMain.handle("plugins:saveFile", …)` (via `dialog.showSaveDialog`, écrit `text` en utf-8 ou `base64` en buffer). 4. Dans `whenReady`, `protocol.handle("app-plugin", …)` : `/local/<file>.html` → `wrapPluginHtml` → `new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "Content-Security-Policy": PLUGIN_CSP } })`. 5. Vérifier que `will-navigate` ne casse pas l'iframe (il ne vise que le niveau supérieur ; ne rien relâcher). |
| `preload.js` *(modifier)* | `contextBridge.exposeInMainWorld("plugins", { list: () => ipcRenderer.invoke("plugins:list"), saveFile: (f) => ipcRenderer.invoke("plugins:saveFile", f) })`. |
| `vite.config.js` *(modifier)* | Ajouter `"frame-src 'self' app-plugin:"` au tableau `CSP`. |
| `package.json` *(modifier)* | `build.files` += `"plugins/**/*"`. |

**CSP servie avec chaque document de plugin** (`PLUGIN_CSP`) :
```
default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
img-src data: blob:; font-src data:; connect-src 'none';
form-action 'none'; base-uri 'none'
```
`'unsafe-inline'` est assumé : c'est le modèle d'un outil mono-fichier. Le
confinement vient du sandbox (origine opaque), de `connect-src 'none'` et de
l'absence de tout accès IPC. À documenter dans `ARCHITECTURE.md`.

#### SDK — `plugins/sdk/trk-plugin-sdk.js`
Injecté en ligne par `wrapPluginHtml`, jamais chargé comme sous-ressource.
Expose `window.TrkPlugin` :
```js
TrkPlugin.ready()                       // envoie plugin:ready, rend une promesse résolue à host:init
TrkPlugin.id / .lang / .capabilities    // renseignés après init
TrkPlugin.t(key, fallback)              // dictionnaire de l'hôte
TrkPlugin.doc()                         // dernier document reçu (ou null)
TrkPlugin.save({ data, title, refs, dataVersion })   // -> plugin:doc:save
TrkPlugin.markDirty(bool)
TrkPlugin.tasks() / .projects()         // dernière projection reçue
TrkPlugin.refreshTasks()
TrkPlugin.revealTask(id)
TrkPlugin.toast(message)
TrkPlugin.saveFile({ name, mime, text | base64 })
TrkPlugin.on(event, cb)                 // "doc" | "snapshot" | "theme" | "lang" | "saved" | "error"
TrkPlugin.applyTheme(theme)             // pose les jetons de l'hôte en variables CSS sur :root
```
Il gère l'enveloppe, la garde de `protocol`, et n'émet rien pour une capacité
non accordée (avertissement console).

#### Le plugin refactoré — `plugins/mindmap.html`
Partir de `plugins/feuille-de-route-web-configurateurs.html` et **conserver
intégralement le moteur** (c'est du code qui marche, et il est bon) :
`walk, index, branchOf, colorOf, passFilter, actionables, ranks, visible, kids,
normDeps, anchorPt, nearestAnchor, anchorsFor, applyOff, wrap, size, measure,
place, layout, elbow, curve, nodeSVG, cardSVG, renderFlow, render, isShown, fit`,
le gestionnaire de pointeur unique (pan/zoom, glisser, redimensionner,
poignées d'accroche, repli au double-clic), l'inspecteur, le panneau de lien,
la vue synthèse.

Modèle de nœud (inchangé, c'est le `data` du document) :
```
{ id, label, color?, side?: "L"|"R", phase?: 1|2|3, prio?: "P0"|"P1"|"P2",
  stat?: "todo"|"doing"|"done"|"decision", owner?, note?,
  deps?: (string | { id, from?, to?, bow? })[], children?: [],
  dx?, dy?, w0?, h0?, link?: { from?, to?, bow?, busDy? },
  refs?: EntityRef[] }                      ← AJOUT
```
Champs runtime préfixés `_` (`_p, _d, _lines, _fs, _fw, _sub`) et `x,y,w,h` :
déjà exclus à la sérialisation, garder ce filtre.

Modifications à apporter :
1. **Ajouter le bloc manifeste** en tête (section 5).
2. **Supprimer le `DATA` codé en dur** (l. 242-315) — il devient le contenu du
   document, chargé par `host:init` / `host:doc`. Prévoir un arbre initial
   minimal (une racine + un axe) quand `doc.data` est vide, et **conserver
   l'ancienne feuille de route comme document d'exemple** exporté en JSON dans
   `plugins/examples/feuille-de-route.json` (le contenu métier ne doit pas être
   perdu).
3. **`dataVersion: 1`** et `data = { root, view?, folded?[] }`.
4. **Remplacer la persistance** : `bSave` (téléchargement JSON) → `TrkPlugin.save(...)`
   appelé automatiquement après chaque mutation (debounce côté SDK ou côté
   plugin, ~300 ms) ; supprimer `bImport` et l'`<input type=file>`.
   Garder un « Exporter en JSON » explicite via `TrkPlugin.saveFile`.
5. **Export PNG** : conserver la sérialisation `scene.innerHTML` → data URI →
   canvas → `toBlob`, puis envoyer le résultat en base64 à
   `TrkPlugin.saveFile` au lieu du téléchargement direct.
6. **Thème** : supprimer `body.light`, `bTheme` et `S.light`. Les variables CSS
   `--bg --panel --panel-2 --line --line-2 --ink --muted --accent` sont
   alimentées par `TrkPlugin.applyTheme` depuis les jetons de l'hôte. Les
   helpers `ink() muted() bgc() linec()` lisent désormais
   `getComputedStyle(document.documentElement)` au lieu de tester `S.light`.
7. **i18n** : toutes les chaînes en dur passent par `TrkPlugin.t("clé", "repli")`.
   Le repli reste le français actuel, donc rien ne casse si une clé manque.
   Ajouter les clés côté hôte dans `fr.ts` / `en.ts` (préfixe `plugin_mindmap_*`),
   envoyées dans `dict`.
8. **Lien vers une tâche (lecture seule)** — la nouveauté fonctionnelle :
   - Dans l'inspecteur, un champ « Tâche liée » : recherche parmi
     `TrkPlugin.tasks()`, sélection → `node.refs = [{ kind:"task", id }]`.
   - Sur le nœud, afficher le statut réel de la tâche liée (`statutLabel`,
     `statutColor`, `minutes` pointées) — **la donnée vient de l'hôte, elle
     n'est jamais recopiée dans le document** ; seul l'`id` est stocké.
   - Bouton « Ouvrir la tâche » → `TrkPlugin.revealTask(id)`.
   - Bouton « Délier ». **Aucune création ni modification de tâche.**
   - Une référence dont l'`id` n'existe plus dans la projection : signaler
     visuellement « tâche introuvable », ne pas supprimer le lien tout seul.
   - Remonter l'union des `refs` de tous les nœuds dans `patch.refs`, pour que
     l'hôte sache quelles entités le document référence.
9. Le `<title>` et `.brand` ne sont plus le titre métier : utiliser
   `doc.title`.
10. `#canvas { position: fixed; inset: 56px 0 0 0 }` fonctionne dans l'iframe,
    mais vérifier le calcul de `syncBar()` et `fit()` sur redimensionnement de
    l'iframe (l'app change de taille, pas la fenêtre) — un `ResizeObserver` sur
    `document.body` est déjà en place pour `.bar`, en ajouter un pour le canevas.

---

## 7. Ordre d'exécution

1. `src/lib/plugins/document.ts` + `bridge.ts` + `projection.ts` (+ leurs tests).
   → `npm test` doit passer avant de continuer.
2. `src/services/storage.ts` : `listKeys`, `deleteValue`, typage `window.plugins`.
3. `electron/plugins.js` + `electron/plugins.test.js`.
4. `plugins/sdk/trk-plugin-sdk.js`.
5. `main.js`, `preload.js`, `vite.config.js`, `package.json` (les 4 modifications
   de câblage). **Annoncer les commandes nécessitant approbation avant de les
   lancer.**
6. `src/services/plugins.ts`.
7. `src/features/plugins/usePluginDocs.ts` puis `usePluginHost.ts`.
8. `PluginFrame.jsx`, `PluginDocBar.jsx`, `PluginsSection.jsx`, `plugins.css`,
   `index.css`.
9. Câblage dans `App.jsx` (branche `viewMode === "plugins"`) et 4ᵉ bouton dans
   `TaskToolbar.jsx`.
10. Clés i18n dans `fr.ts` et `en.ts`.
11. `plugins/mindmap.html` : refonte selon la section 6, + export du contenu
    métier dans `plugins/examples/feuille-de-route.json`.
12. Supprimer `plugins/feuille-de-route-web-configurateurs.html` **seulement
    après** avoir vérifié que le contenu métier est bien préservé dans le JSON
    d'exemple.
13. `ARCHITECTURE.md` : module `plugins/`, contrat IPC (`plugins:list`,
    `plugins:saveFile`), scheme `app-plugin`, schéma des clés
    `plugin-doc:*`, section sécurité (sandbox, CSP dédiée, lecture seule).
14. `npm run typecheck && npm run lint && npm test`, puis `npm run build`.

## 8. Définition du terminé

- [ ] Déposer un `.html` avec un manifeste valide dans `plugins/` le fait
      apparaître dans la vue Plugins **sans recompilation**.
- [ ] Un manifeste absent / invalide / d'`apiVersion` trop récente est signalé
      dans l'UI, sans casser les autres plugins.
- [ ] La carte mentale s'ouvre, se modifie, et son document persiste dans
      `data/store.json` sous `plugin-doc:mindmap:<id>`.
- [ ] Plusieurs documents, portée globale ou par projet, renommage, suppression.
- [ ] Un nœud lié à une tâche affiche le statut réel issu de l'app, et
      « Ouvrir la tâche » ouvre bien le modal d'édition.
- [ ] Aucun chemin de code ne permet à un plugin de créer ou modifier une tâche.
- [ ] Thème (dark/light/random) et langue suivis dans l'iframe.
- [ ] Exports JSON et PNG passent par le dialogue natif.
- [ ] `typecheck`, `lint`, `test` verts ; `ARCHITECTURE.md` à jour.
