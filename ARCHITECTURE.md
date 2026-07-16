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
main.js              # Processus principal : fenêtre (frame:false, sandbox),
                     #   handlers IPC (storage/config/dialogues/fenêtre),
                     #   garde-fous de navigation, flush du store à la sortie
preload.js           # contextBridge : window.storage / config / dataIO /
                     #   windowControls (surface minimale, pas de Node côté renderer)

src/
  main.jsx           # Point d'entrée : polices locales (@fontsource), styles,
                     #   LanguageProvider, App
  App.jsx            # Coquille de composition : état de vue (filtres, tri,
                     #   modals, thème, célébrations) + assemblage des features
  styles/            # CSS extrait par domaine, ordre d'import significatif
                     #   (index.css) ; tokens.css porte les design tokens
  i18n/              # Provider mémoïsé (index.tsx), dictionnaires fr.ts/en.ts,
                     #   aide de pluriel (plural.ts) ; src/i18n.jsx = shim
  lib/               # Logique pure, TypeScript strict :
                     #   types.ts (Task, TimeLog, Project, StatusId, BackupPayload)
                     #   statuses.ts, time.ts, search.ts, colors.ts,
                     #   markdown.ts (frontière XSS), backup.ts (validation +
                     #   normalisation + version/migration), uid.ts
                     #   src/utils.js = shim de ré-export
  services/
    storage.ts       # Enveloppe l'IPC storage/config ; repli localStorage
                     #   pour `vite dev` hors Electron
  hooks/             # Hooks génériques (TS) : useOutsideClick, useEscapeKey,
                     #   useLocalStorageState, useInterval, usePagination
  components/        # Présentation réutilisable : Gauge, ProgressBar,
                     #   Pagination, EmptyState, TitleBar, AppHeader,
                     #   LangSwitch, MarkdownEditor, ChartCard, Toast
  features/
    tasks/           # useTasks (source de vérité + CRUD + pointage),
                     #   TaskList, TaskRow, TaskModal, TaskToolbar,
                     #   StatusFilterDropdown
    kanban/          # KanbanSection, KanbanBoard, KanbanColumn, KanbanCard
    timelog/         # TimeLogPopover, TimeLogSection, TimeLogEntryRow
    focus/           # useFocusSession, FocusContext (+ useLiveMinutes),
                     #   FocusZone
    projects/        # useProjects, ProjectSidebar
    charts/          # useChartData, ChartsSection, GanttChart
    backup/          # useBackup, ImportConfirmModal
  celebration.jsx    # Overlays canvas + sons Web Audio (bus partagé)
  tips.jsx           # Bulles d'aide et tutoriel de démarrage
```

## Flux de données

- `useTasks` (features/tasks) est la **source de vérité** : il charge
  `{ tasks, projects }` au démarrage (config projets puis store) et persiste
  les deux ensemble à chaque mutation via `services/storage`.
- Les mutations passent toutes par le hook (`upsertTask`, `deleteTask`,
  `moveTask`, `addTimeLog`, …). Les refs internes (`tasksRef`, `projectsRef`)
  garantissent que les callbacks différés (timer de sortie du focus)
  persistent l'état **du dernier rendu**, jamais une capture périmée.
- `useFocusSession` gère la tâche en focus (persistée dans localStorage) et
  pointe le temps écoulé (plafonné à 8 h/jour calendaire) à la sortie.
- `FocusContext` expose `{ focusId, focusStartedAt }` ; `useLiveMinutes(task)`
  fait tiquer un intervalle **local au composant** (badges, cartes, popovers),
  l'App entière ne re-rend pas toutes les 10 s.
- Les timeLogs affichés dans le modal d'édition viennent du **store**
  (`storeTask`), pas du brouillon : le pointage reste juste même pendant
  une édition ouverte.

## Contrat IPC (preload -> main)

| Canal | Requête | Réponse |
|---|---|---|
| `storage:get` | `key` | `{ key, value } \| null` |
| `storage:set` | `key, value` (objet JSON tel quel) | `{ key, ok: true }` |
| `storage:delete` | `key` | `{ key, deleted }` |
| `storage:list` | `prefix?` | `{ keys, prefix }` |
| `config:getProjects` | — | `string[]` |
| `config:setProjects` | `string[]` | `{ ok: true }` |
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
  `lib/markdown.test.js`.

## Outillage

| Commande | Rôle |
|---|---|
| `npm run dev` | Vite en mode dev (repli localStorage, sans Electron) |
| `npm start` | Build + Electron |
| `npm test` | Vitest (74 tests : lib, i18n, modal, kanban, import, XSS) |
| `npm run typecheck` | `tsc --noEmit` strict sur `src/**/*.ts(x)` |
| `npm run lint` | ESLint (react-hooks/exhaustive-deps actif) |
| `npm run format` | Prettier |
| `npm run dist:win` / `dist:linux` | Portable Windows / AppImage |

CI (`.github/workflows/build.yml`) : lint + typecheck + tests sur chaque
push/PR ; build + release sur tag `v*`.
