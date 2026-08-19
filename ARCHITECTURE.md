# Architecture

Application de bureau portable (Electron + React 18 + Vite) de suivi de tâches
par projet, avec pointage du temps, kanban, zone de focus et graphiques.
Les données vivent dans un dossier `data/` à côté de l'exécutable (portable),
avec repli sur le dossier utilisateur si le support est en lecture seule.

## Carte des modules

```
electron/
  store.js           # Store clé/valeur JSON : cache mémoire, écritures
                     #   regroupées (debounce 200 ms), écriture atomique
                     #   (tmp + rename), copie .bak, relecture de secours
  logger.js          # Journal data/debug.log (tronqué au lancement), tampon
                     #   mémoire borné tant qu'aucun dossier n'est écrivable
  plugins.js         # Découverte brute des plugins : (v1) .html autonome par
                      #   nom, (v2) dossiers `format: "trk.extension/2"`. Lecture
                      #   de ressource par chemin avec garde anti-traversée
                      #   (realpath) ; CSP par format (v1 unsafe-inline, v2
                      #   'self' sans unsafe-inline). Ne valide aucun manifeste
                      #   : cf. src/lib/plugins/{manifest,manifest2}.ts
main.js              # Processus principal : fenêtre (frame:false, sandbox),
                     #   handlers IPC (storage/config/images/plugins/dialogues/
                     #   fenêtre), protocoles app-image: et app-plugin:,
                     #   garde-fous de navigation, flush du store à la sortie
preload.js           # contextBridge : window.storage / config / dataIO /
                     #   images / plugins / windowControls (surface minimale,
                     #   pas de Node côté renderer)

plugins/             # Plugins (v1 = fichier .html autonome à manifeste
                      #   embarqué ; v2 = dossier `trk.extension/2` :
                      #   manifest.json + assets servis par app-plugin:). Livrés
                      #   avec l'app (ici) ou déposés par l'utilisateur à côté de
                      #   l'exécutable.
  mindmap.html       # Carte mentale / feuille de route, liens en lecture
                     #   seule vers les tâches. Moteur de rendu SVG maison.
  sdk/trk-plugin-sdk.js # SDK injecté en ligne dans chaque plugin (jamais en
                     #   sous-ressource) : window.TrkPlugin, cf. § Plugins
  examples/          # Documents d'exemple au format `data` d'un plugin,
                     #   sans valeur applicative propre (contenu métier
                     #   historique conservé après une refonte)

src/
  main.jsx           # Point d'entrée : polices locales (@fontsource), styles,
                     #   LanguageProvider, App
  App.jsx            # Coquille de composition : état de vue (filtres, tri,
                     #   modals, thème, mode post-it, célébrations) +
                     #   assemblage des features
  styles/            # CSS extrait par domaine, ordre d'import significatif
                     #   (index.css) ; tokens.css porte les design tokens ;
                     #   random.css (motifs du thème aléatoire) et sticky.css
                     #   (mode post-it) sont importés en dernier, ils
                     #   surchargent tout le reste
  i18n/              # Provider mémoïsé (index.tsx), dictionnaires fr.ts/en.ts,
                     #   aide de pluriel (plural.ts) ; src/i18n.jsx = shim
  lib/               # Logique pure, TypeScript strict :
                     #   types.ts (Task, TimeLog, Project, StatusId, BackupPayload)
                     #   statuses.ts, time.ts, search.ts, uid.ts,
                     #   colors.ts (couleur projet + jetons du thème aléatoire),
                     #   markdown.ts (frontière XSS), backup.ts (validation +
                     #   normalisation + version/migration),
                     #   mdFormatting.ts (barre d'outils, mode Texte),
                     #   richTextEditing.ts (idem sur le DOM, mode Formaté),
                     #   htmlToMarkdown.ts (turndown + GFM, retour au Markdown),
                     #   images.ts (références app-image: d'une description)
                     #   src/utils.js = shim de ré-export
    plugins/         # Contrat du système de plugins, logique pure :
                     #   types.ts (constantes + types du protocole),
                     #   manifest.ts (extraction + validation du manifeste),
                     #   document.ts (enveloppe PluginDocument, clé de
                     #   stockage, patch), bridge.ts (encode/décode postMessage,
                     #   capacités), projection.ts (TaskProjection, thème)
  services/
    storage.ts       # Enveloppe l'IPC storage/config/images ; repli
                     #   localStorage pour `vite dev` hors Electron ;
                     #   listKeys/deleteValue pour les documents de plugin
    plugins.ts       # Découverte des plugins (IPC | repli import.meta.glob
                     #   en dev), URL d'iframe, export de fichier (saveFile)
  hooks/             # Hooks génériques (TS) : useOutsideClick, useEscapeKey,
                     #   useLocalStorageState, useInterval, usePagination,
                     #   useUndoRedoShortcut (Ctrl+Z / Ctrl+Y globaux)
  components/        # Présentation réutilisable : Gauge, ProgressBar,
                     #   Pagination, EmptyState, TitleBar, AppHeader,
                     #   LangSwitch, ChartCard, Toast,
                     #   MarkdownEditor (bascule Texte / Formaté, barre
                     #   d'outils, collage d'images, undo/redo local)
  features/
    tasks/           # useTasks (source de vérité + CRUD + archivage +
                     #   pointage + undo/redo), TaskList, TaskRow, TaskModal,
                     #   TaskToolbar, StatusFilterDropdown
    kanban/          # KanbanSection, KanbanBoard, KanbanColumn, KanbanCard
    timelog/         # TimeLogPopover, TimeLogSection, TimeLogEntryRow
    focus/           # useFocusSession, FocusContext (+ useLiveMinutes),
                     #   FocusZone
    projects/        # useProjects, ProjectSidebar
    charts/          # useChartData, ChartsSection, GanttChart
    backup/          # useBackup, ImportConfirmModal
    plugins/         # usePluginDocs (CRUD des documents), usePluginHost (le
                     #   pont postMessage), PluginsSection, PluginDocBar,
                     #   PluginFrame, NodeGlyph (cf. § Système de plugins)
  celebration.jsx    # Overlays canvas + sons Web Audio (bus partagé)
  tips.jsx           # Bulles d'aide et tutoriel de démarrage
```

## Flux de données

- `useTasks` (features/tasks) est la **source de vérité** : il charge
  `{ tasks, projects }` au démarrage (config projets puis store) et persiste
  les deux ensemble à chaque mutation via `services/storage`.
- Les mutations passent toutes par le hook (`upsertTask`, `deleteTask`,
  `archiveTask`, `moveTask`, `addTimeLog`, …). Les refs internes (`tasksRef`,
  `projectsRef`) garantissent que les callbacks différés (timer de sortie du
  focus) persistent l'état **du dernier rendu**, jamais une capture périmée.
- **Undo/redo** : chaque mutation empile un instantané `{ tasks, projects }`
  (100 au plus) avant de remplacer l'état ; `undo`/`redo` déplacent l'état
  courant vers la pile opposée et persistent l'instantané restauré. Toute
  nouvelle action vide la pile de redo.
- Les tâches **archivées** (`archived: true`) restent dans le store mais sont
  exclues de l'avancement global, des graphiques et des célébrations ; elles
  n'apparaissent que dans la vue « Archivées » (recherche + tri, sans les
  filtres projet/statut).
- Au chargement, `useTasks` collecte les images encore référencées par les
  descriptions (`lib/images.ts`) et demande la purge des orphelines
  (`images:prune`) — uniquement si le store a bien été relu, pour ne jamais
  purger sur la foi d'une lecture échouée.
- `useFocusSession` gère la tâche en focus (persistée dans localStorage) et
  pointe le temps écoulé (plafonné à 8 h/jour calendaire) à la sortie.
- `FocusContext` expose `{ focusId, focusStartedAt }` ; `useLiveMinutes(task)`
  fait tiquer un intervalle **local au composant** (badges, cartes, popovers),
  l'App entière ne re-rend pas toutes les 10 s.
- Les timeLogs affichés dans le modal d'édition viennent du **store**
  (`storeTask`), pas du brouillon : le pointage reste juste même pendant
  une édition ouverte.

## Système de plugins

Un plugin est **hébergé à l'exécution, jamais compilé**, sous l'une des deux
formes (cf. `PLUGIN_FORMAT_V2.md`) :
- **v1** — un fichier `.html` autonome (manifeste embarqué), servi en ligne par
  le protocole `app-plugin:` (hôte `local`).
- **v2** — un dossier `trk.extension/2` (`manifest.json` + assets sous
  `app-plugin:<pluginId>/…`) : page d'accueil déclarative et/ou scripts isolés.

Les vues **déclaratives** (`contributes.views[].kind === "declarative"`) ne
passent par aucune iframe : leur spec `trk.view/1` (`lib/plugins/viewSpec.ts`)
est lue par l'hôte et rendue par `features/plugins/DeclarativeView.jsx` (moteur
d'expressions `trkx`, `lib/plugins/trkx.ts`). Une vue déclarative n'a ni JS, ni
origine, ni CSP à négocier. Les vues **app** (scripts isolés) se chargent dans
une iframe `app-plugin://<pluginId>/` avec une CSP par origine.

Les vues **app** (`kind: "app"`, `entry` = page HTML du dossier) tournent dans
une iframe `sandbox="allow-scripts allow-same-origin"`, origine
`app-plugin://<id>`. Leur CSP v2 (`buildPluginCsp(2)`,
`electron/plugins.js`) coupe le réseau et n'autor'ise **pas** `unsafe-inline` :
le SDK est servi par l'hôte à `app-plugin://<id>/@trk/sdk.js` (`plugins/sdk/
trk-plugin-sdk.mjs`, variante module ES de `trk-plugin-sdk.js`), importable via
`import trk from "trk:sdk"` grâce à une carte d'imports posée par la page. La
page déclare son identité via `<meta name="trk-plugin-id" content="…">`
(préalable à `host:init`, cf. `usePluginHost.ts`).

**Points de contribution** (`contributes`, cf. `PLUGIN_FORMAT_V2.md` § 4). Le
manifeste v2 est validé dans `lib/plugins/manifest2.ts` (structure, grammaire
d'`id`, `engines`, permissions, et analyse statique de chaque expression `trkx`
déclarée : `commands.when`, `taskColumns.value`/`tone`). `normalizeV2Manifest`
(`services/plugins.ts`) reporte `commands`, `taskColumns`, `taskPanels` et
`settings` sur le `PluginManifest` consommé par l'UI. Implémenté : les
**commandes** contribuées apparaissent dans une barre d'outils propre à la vue
du plugin (`PluginsSection`), et un clic poste `host:command` au plugin via le
pont ; le SDK (`trk.commands.on`/`enable`, dans les deux variantes) reçoit
`host:command` et déclenche le gestionnaire abonné. `taskColumns`,
`taskPanels` et `settings` sont remontés sur le manifeste mais leur rendu UI
reste à faire (phases suivantes).

Les deux formes sont déposées dans `plugins/` (livrées avec l'app) ou à côté de
l'exécutable (déposées par l'utilisateur) — pas de recompilation, pas de plugin
dans le bundle. Un plugin est chargé dans une iframe `sandbox="allow-scripts"`
et ne communique avec l'hôte que par `postMessage`.

**Deux décisions non négociables** (cf. `PLUGIN_PLAN.md`) :
1. Hébergement HTML chargé à l'exécution, jamais compilé.
2. Un plugin **ne crée ni ne modifie jamais** une tâche : les liens vers les
   entités de l'app (`EntityRef`) sont en lecture seule. `plugin:task:reveal`
   (ouvrir une tâche dans l'app) est de la navigation, pas une mutation.

### Chaîne de confiance
1. `sandbox="allow-scripts"` → origine opaque : pas de `localStorage`, pas de
   DOM parent, pas de navigation, pas de formulaire, `confirm()`/`alert()`
   inopérants (le SDK et les plugins ne s'y fient jamais).
2. La CSP servie avec le document du plugin (`PLUGIN_CSP`, `electron/plugins.js`)
   coupe le réseau : `default-src 'none'; connect-src 'none'`.
3. Le plugin n'a aucun accès disque ni IPC direct : il ne voit que ce que
   l'hôte lui envoie, filtré par les capacités déclarées dans son manifeste
   (`doc`, `tasks:read`, `task:reveal`, `file:save`, `toast`).
4. L'hôte authentifie chaque message par `event.source === iframe.contentWindow`
   (l'`event.origin` d'une iframe sandboxée vaut toujours `"null"`, inutilisable),
   puis valide `ns`/`protocol`/`pluginId`/forme/capacité (`lib/plugins/bridge.ts`)
   avant de dispatcher quoi que ce soit.
5. Aucun message de mutation n'existe dans le protocole `trk.plugin`.

### Format de document
Enveloppe commune à tous les plugins (`lib/plugins/document.ts`), stockée sous
`plugin-doc:<pluginId>:<docId>` : `{ schema, pluginId, dataVersion, id, title,
scope, refs: EntityRef[], createdAt, updatedAt, data }`. Seul `data` appartient
au plugin ; l'hôte gère le reste (liste des documents, portée globale/projet,
liens, stockage) sans code spécifique par plugin.

### Protocole (`ns: "trk.plugin"`, `protocol: 1`)
`host:init/doc/snapshot/theme/lang/saved/error` (hôte → plugin) et
`plugin:ready/doc:save/dirty/snapshot:refresh/task:reveal/toast/file:save`
(plugin → hôte), chacun gardé par la capacité déclarée dans le manifeste. Le
pont vit dans `features/plugins/usePluginHost.ts` côté hôte, et dans
`plugins/sdk/trk-plugin-sdk.js` (`window.TrkPlugin`) côté plugin — ce dernier
est injecté **en ligne** dans le document servi (jamais en sous-ressource, la
CSP du plugin n'autorise que `script-src 'unsafe-inline'`).

### Le plugin livré : `mindmap.html`
Carte mentale / feuille de route. Un nœud peut référencer une tâche (`refs:
[{kind:"task", id}]`) : le statut affiché vient de la projection envoyée par
l'hôte (`TaskProjection`, résolue via `lib/statuses.ts`), jamais recopié dans
le document. Une référence dont la tâche a disparu est signalée (« tâche
introuvable ») sans être supprimée automatiquement.

**Édition (v2).** Trois accès au même vocabulaire d'actions — barre d'outils,
clic droit, clavier — les libellés étant partagés entre le menu contextuel et
la feuille de raccourcis (`?`). Points structurants :

- **Historique** (`HIST`, `commit()` / `undo()` / `redo()`). La pile ne contient
  que l'arbre (`treeSnapshot()`) : le pli et le mode de vue en sont exclus pour
  qu'un Ctrl+Z ne fasse jamais sauter l'affichage. `BASE` porte l'état du
  dernier point d'annulation ; une clé de fusion regroupe les frappes d'un même
  champ, si bien qu'une saisie se défait d'un seul coup.
- **Toute mutation passe par `commit()`.** C'est ce qui permet de supprimer sans
  confirmation. La seule action encore confirmée en deux clics est l'import,
  que l'annulation ne couvre pas : il remplace le document et vide l'historique.
- **Menu contextuel** (`menuForNode` / `menuForLink` / `menuForCanvas`) : une
  surface unique, dont l'arête gauche et la rubrique prennent la couleur de la
  phase visée. Les états et priorités s'y règlent par bandes de pastilles, sans
  sous-menu.
- **Dépendances au pointeur** : poignée ronde d'un nœud sélectionné, ou
  Alt + glisser. `connect()` refuse les doublons, les liens vers sa propre
  branche et tout ce qui créerait un cycle (`dependsOn`).
- La légende permanente a disparu du canevas : ses repères vivent dans la
  feuille `?`. Les couleurs d'état viennent désormais des jetons de l'hôte
  (`--ok` / `--warn` / `--danger`), pour rester justes sur le thème clair.

## Contrat IPC (preload -> main)

| Canal | Requête | Réponse |
|---|---|---|
| `storage:get` | `key` | `{ key, value } \| null` |
| `storage:set` | `key, value` (objet JSON tel quel) | `{ key, ok: true }` |
| `storage:delete` | `key` | `{ key, deleted }` |
| `storage:list` | `prefix?` | `{ keys, prefix }` |
| `config:getProjects` | — | `string[]` |
| `config:setProjects` | `string[]` | `{ ok: true }` |
| `images:save` | `ArrayBuffer` (image redimensionnée) | `{ url, width, height }` |
| `images:prune` | `string[]` (fichiers encore référencés) | `{ removed }` |
| `plugins:list` | — | `RawPluginEntry[]` (`{file, origin, manifestJson, error?}`, non validé) |
| `plugins:saveFile` | `{ name, mime, text? \| base64? }` | `{ canceled, filePath? }` |
| `data:export` | `BackupPayload` | `{ canceled, filePath? }` |
| `data:import` | — | `{ canceled, filePath?, data?, error? }` |
| `window:minimize/toggleMaximize/close/isMaximized` | — | — / booléen |
| `window:maximized-changed` (main -> renderer) | booléen | — |

## Schéma de `data/store.json`

```jsonc
{
  "suivi-travaux-data": {
    "tasks": [
      {
        "id": "uuid",
        "type": "standard",        // ou "simple" ; absent = standard
        "titre": "…",              // requis
        "projet": "…",             // requis, nom de projet
        "description": "…",        // markdown
        "priorite": "critique | haute | moyenne | basse",
        "statut": "analyser | implementer | revue | integrer | valider | termine"
                  // ou "todo | doing | done" pour les tâches simples
        ,
        "assigne": "…",
        "dateDebut": "AAAA-MM-JJ",
        "echeance": "AAAA-MM-JJ",
        "archived": false,         // absent = false ; sort des vues actives
        "timeLogs": [{ "id": "uuid", "minutes": 30, "note": "…", "date": "AAAA-MM-JJ" }]
      }
    ],
    "projects": ["Nom de projet", "…"]
  }
}
```

Notes :
- Les anciennes versions stockaient la valeur sous forme de **chaîne JSON**
  (double encodage) ; la lecture accepte encore ce format et le réécrit en
  objet à la première sauvegarde.
- `store.json.bak` est la dernière version saine ; il est lu si le fichier
  principal est corrompu. L'écriture est atomique (fichier temporaire puis
  `rename`), une coupure de courant ne peut pas tronquer le store.
- `projects.config.json` (même dossier) est éditable à la main et sert de
  liste initiale de projets ; il est resynchronisé à chaque sauvegarde.
- `data/images/*.jpg` : images collées dans les descriptions, servies par le
  protocole `app-image:`. Elles ne sont référencées que par l'URL présente
  dans le Markdown ; les fichiers orphelins sont supprimés au démarrage.
- `plugin-doc:<pluginId>:<docId>` : un document de plugin par clé (schéma
  `PluginDocument`, cf. § Système de plugins), énuméré par
  `storage:list("plugin-doc:<pluginId>:")`. Opaque pour l'hôte hors enveloppe
  (`schema, pluginId, dataVersion, id, title, scope, refs, createdAt,
  updatedAt`) ; `data` est laissé au plugin.

## Format de sauvegarde (export/import)

`BackupPayload` (lib/types.ts) : `{ tasks, projects, exportedAt, version }`.
- `version` est écrite depuis la v1.4 (`BACKUP_FORMAT_VERSION` = 1) ;
  absente = format initial. `migrateBackup` (lib/backup.ts) adapte les
  anciens formats à la lecture.
- À l'import : `isValidBackupData` (forme minimale : titre + projet par
  tâche), puis `normalizeBackupData` (champs manquants complétés, statut et
  priorité inconnus remis aux valeurs par défaut, projets réconciliés avec
  ceux référencés par les tâches).

## Sécurité

- Renderer sans Node (`contextIsolation`, `sandbox: true`), surface IPC
  minimale via `contextBridge`.
- Navigation refusée (`will-navigate`, `setWindowOpenHandler`) : les liens
  externes partent vers le navigateur système.
- CSP stricte injectée **au build** (vite.config.js) : tout est embarqué
  (scripts, styles, polices locales @fontsource), aucune ressource distante.
- `renderMarkdown` (lib/markdown.ts) est la frontière XSS : tout HTML issu du
  markdown (y compris importé) passe par DOMPurify. Tests dédiés dans
  `lib/markdown.test.js`. Le mode Formaté édite ce HTML **déjà assaini** puis
  le reconvertit en Markdown (`htmlToMarkdown`) : rien n'entre dans le store
  sans être repassé par cette frontière au rendu suivant.
- `images:prune` ne supprime que les fichiers correspondant au motif écrit
  par `images:save` (`uuid.jpg`) dans `data/images` — même garde que le
  protocole `app-image:`, jamais de chemin venant du renderer.
- **Plugins** : iframe `sandbox="allow-scripts"` (origine opaque, pas de
  `bypassCSP`), CSP dédiée par document servi (`default-src 'none';
  connect-src 'none'`, cf. § Système de plugins), authentification des
  messages par `event.source`, capacités du manifeste comme seule surface
  d'autorisation. `readPluginHtml`/`app-image` partagent la même garde de nom
  de fichier (`^[\w-]+\.(html|jpg)$`) contre toute traversée de répertoire.
  Aucun canal de mutation des tâches n'existe dans le protocole `trk.plugin`.

## Outillage

| Commande | Rôle |
|---|---|
| `npm run dev` | Vite en mode dev (repli localStorage, sans Electron) |
| `npm start` | Build + Electron |
| `npm test` | Vitest (~200 tests : lib, i18n, modal, kanban, éditeur markdown, store, import, XSS, plugins) |
| `npm run typecheck` | `tsc --noEmit` strict sur `src/**/*.ts(x)` |
| `npm run lint` | ESLint (react-hooks/exhaustive-deps actif) |
| `npm run format` | Prettier |
| `npm run dist:win` / `dist:linux` | Portable Windows / AppImage |
| `npm run dist:docker` | Les deux cibles dans un conteneur (image `electronuserland/builder:wine`, sortie dans `release/`) |

CI (`.github/workflows/build.yml`) : lint + typecheck + tests sur chaque
push/PR ; build + release sur tag `v*`.
