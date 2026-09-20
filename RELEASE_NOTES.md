# Release Notes / Notes de version

[Français](#français) · [English](#english)

---

## Français

### 2.0.0 — 2026-07-25

**Nouveautés**
- Archives : archiver / désarchiver une tâche (avec confirmation) et vue
  « Archivées » dédiée ; les tâches archivées sortent de l'avancement global,
  des graphiques et des célébrations
- Annuler / Rétablir : boutons dans l'en-tête et raccourcis Ctrl+Z /
  Ctrl+Y (ou Ctrl+Maj+Z), sur les 100 dernières actions (tâches et projets)
- Éditeur de description repensé : bascule **Texte / Formaté** (édition
  directe du rendu) avec barre d'outils — gras, italique, barré, titres 1-3,
  citation, code en ligne et bloc de code, lien, image, listes à puces /
  numérotées / cases à cocher, séparateur, tableau, couleur du texte
  (palette + couleur libre), police (sans, serif, mono, manuscrite), et
  annuler / rétablir propre à l'éditeur
- Thème « aléatoire » : troisième thème tiré au sort (teinte + motif de
  fond), conservé jusqu'au prochain tirage
- Mode « post-it » : superposable à n'importe quel thème — écriture
  manuscrite, tâches en notes autocollantes colorées par projet et cerclées
  par priorité, marmite animée dans la zone de focus (l'eau bout de plus en
  plus fort avec le temps passé)
- Gantt cliquable : cliquer une barre ouvre la tâche correspondante
- Le type d'une tâche (complet / simple) est modifiable après création ;
  déposer une carte dans une colonne de l'autre tableau la convertit

**Améliorations**
- Zone de focus : « retirer la tâche » remonté dans le bandeau, à côté de
  « réduire » ; la carte ne porte plus qu'une seule action
- Traductions FR/EN pour toutes les fonctionnalités ci-dessus

**Corrections**
- Les images collées puis retirées d'une description sont désormais
  supprimées du disque au démarrage : `data/images` ne grossit plus
  indéfiniment
- Journalisation : le tampon mémoire est borné quand aucun dossier n'est
  accessible en écriture

**Technique**
- Build Docker : `npm run dist:docker` produit le `.exe` Windows et
  l'AppImage Linux sans installer wine localement
- Conversion HTML → Markdown (turndown + GFM) pour le mode Formaté
- Nouveaux modules purs et testés : `mdFormatting`, `richTextEditing`,
  `htmlToMarkdown`, `images`
- 150 tests unitaires (contre 74)

### 1.5.2 — 2026-07-20

**Nouveautés**
- Éditeur Markdown : coller une image depuis le presse-papiers directement
  dans la description d'une tâche
- Les images sont redimensionnées et compressées avant d'être stockées dans
  un dossier dédié (plus de base64 dans le JSON)
- Redimensionnement des images depuis l'aperçu Markdown

**Améliorations**
- Mise en avant visuelle de la tâche en focus dans le kanban et la liste
- Traductions FR/EN pour les nouveaux messages liés aux images

### 1.5.1 — 2026-07-16

**Corrections**
- Correction du chargement des données sauvegardées sous Windows

**Technique**
- Journaux (logs) désormais écrits dans le dossier de données

### 1.5.0 — 2026-07-16

**Améliorations**
- Politique de sécurité de contenu (CSP) stricte appliquée aux builds de
  production
- Normalisation des données lors de l'import d'une sauvegarde

**Technique**
- Refonte du code : découpage de l'application en modules par fonctionnalité
  (tâches, kanban, projets, focus, sauvegarde, graphiques, journal de temps)
- Migration progressive vers TypeScript (hooks, logique métier, i18n)
- Design tokens CSS pour un theming cohérent
- Ajout d'ESLint, Prettier et de tests unitaires supplémentaires
- Documentation d'architecture (ARCHITECTURE.md)

### 1.4.0 — 2026-07-16

**Nouveautés**
- Zone de focus : glisser une tâche dessus pour s'y concentrer (une seule à
  la fois), le temps passé est suivi automatiquement ; boutons pour terminer,
  passer à l'étape suivante ou retirer la tâche ; zone réductible
- Tâches « simples » à 3 états (à faire / en cours / terminé) en plus du
  workflow complet à 6 statuts, avec sections séparées dans le kanban
- Éditeur Markdown pour les descriptions de tâches : modes écrire / aperçu /
  partagé, aide-mémoire de syntaxe
- Guide de démarrage interactif au premier lancement, revisitable via le
  bouton « ? »
- Bulles d'aide « ? » sur chaque section (avancement, projets, tâches,
  sauvegarde, graphiques)

**Améliorations**
- Confirmation avant d'abandonner des modifications non enregistrées
- Traductions FR/EN pour toutes les fonctionnalités ci-dessus

### 1.3.1 — 2026-07-14

**Nouveautés**
- Mini célébration (confettis + carillon) quand une tâche passe à « terminé »
- Bouton global pour activer / désactiver les célébrations (effets et sons),
  réglage mémorisé

**Corrections**
- Une mini célébration ne rejoue plus toute seule après la grande célébration

### 1.3.0 — 2026-07-13

**Nouveautés**
- Vue kanban avec glisser-déposer des tâches entre colonnes
- Pagination de la vue liste
- Recherche instantanée insensible aux accents/majuscules
- Filtre par priorité (en plus du filtre par statut)
- Thème clair / sombre
- Graphiques agrandissables en plein écran
- Animation de célébration avec son quand toutes les tâches sont terminées
  (5 variantes aléatoires + variante légendaire rare, 1/1000)

**Améliorations**
- Confirmation explicite avant suppression d'une tâche
- Nouvelles traductions FR/EN pour toutes les fonctionnalités ci-dessus

### 1.2.0 — 2026-07-12

- Export / import de toutes les données en un seul fichier JSON, via les
  boîtes de dialogue natives de l'OS

### 1.1.0 — 2026-07-11

- Interface bilingue FR/EN avec sélecteur de langue

### 1.0.0-beta — 2026-07-11

**Version initiale**
- Suivi de tâches par projet : priorités, échéances, statut, temps passé
- Vue gantt et graphiques (répartition par statut, projet, priorité, temps passé)
- Stockage local en fichier JSON à côté de l'exécutable, portable sur clé USB / SSD externe (Windows `.exe` + Ubuntu `.AppImage`)
- Repli automatique sur le dossier utilisateur si l'emplacement n'est pas accessible en écriture
- Builds automatisés via GitHub Actions

---

## English

### 2.0.0 — 2026-07-25

**New**
- Archives: archive / unarchive a task (with confirmation) and a dedicated
  "Archived" view; archived tasks are excluded from global progress, charts
  and celebrations
- Undo / Redo: header buttons and Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z)
  shortcuts, over the last 100 actions (tasks and projects)
- Redesigned description editor: **Text / Formatted** toggle (edit the
  rendered output directly) with a toolbar — bold, italic, strikethrough,
  headings 1-3, quote, inline code and code block, link, image, bullet /
  numbered / checklist lists, divider, table, text color (palette + custom
  color), font (sans, serif, mono, handwritten), and editor-local undo/redo
- "Random" theme: a third theme drawn at random (hue + background pattern),
  kept until the next draw
- "Sticky note" mode: layers on top of any theme — handwritten font, tasks
  as sticky notes colored by project and outlined by priority, animated pot
  in the focus zone (the water boils harder the longer you stay focused)
- Clickable Gantt: clicking a bar opens the matching task
- A task's type (full / simple) can be changed after creation; dropping a
  card into a column of the other board converts the task

**Improvements**
- Focus zone: "release the task" moved up into the header bar, next to
  "reduce"; the card now carries a single action
- FR/EN translations for all the features above

**Fixes**
- Images pasted then removed from a description are now deleted from disk at
  startup: `data/images` no longer grows forever
- Logging: the in-memory buffer is bounded when no folder is writable

**Technical**
- Docker build: `npm run dist:docker` produces the Windows `.exe` and the
  Linux AppImage without installing wine locally
- HTML → Markdown conversion (turndown + GFM) for the Formatted mode
- New pure, tested modules: `mdFormatting`, `richTextEditing`,
  `htmlToMarkdown`, `images`
- 150 unit tests (up from 74)

### 1.5.2 — 2026-07-20

**New**
- Markdown editor: paste an image from the clipboard directly into a task
  description
- Images are resized and compressed before being stored in a dedicated
  folder (no more base64 in the JSON)
- Resize images from the Markdown preview

**Improvements**
- Visual highlight for the task currently in focus in the kanban and list
  views
- FR/EN translations for the new image-related messages

### 1.5.1 — 2026-07-16

**Fixes**
- Fixed saved data not loading on Windows

**Technical**
- Logs are now written to the data folder

### 1.5.0 — 2026-07-16

**Improvements**
- Strict Content Security Policy enforced on production builds
- Backup data normalization on import

**Technical**
- Code overhaul: application split into feature modules (tasks, kanban,
  projects, focus, backup, charts, time log)
- Gradual TypeScript migration (hooks, business logic, i18n)
- CSS design tokens for consistent theming
- Added ESLint, Prettier and additional unit tests
- Architecture documentation (ARCHITECTURE.md)

### 1.4.0 — 2026-07-16

**New**
- Focus zone: drag a task onto it to concentrate on it (one at a time), time
  spent is tracked automatically; buttons to finish, advance to the next step
  or release the task; collapsible zone
- "Simple" tasks with 3 states (to do / doing / done) alongside the full
  6-status workflow, with separate sections in the kanban
- Markdown editor for task descriptions: write / preview / split modes,
  syntax cheat sheet
- Interactive getting-started guide on first launch, replayable via the "?"
  button
- "?" help tips on every section (progress, projects, tasks, backup, charts)

**Improvements**
- Confirmation before discarding unsaved changes
- FR/EN translations for all the features above

### 1.3.1 — 2026-07-14

**New**
- Mini celebration (confetti + chime) when a task moves to "done"
- Global button to enable / disable celebrations (effects and sounds),
  setting remembered

**Fixes**
- A mini celebration no longer replays on its own after the big celebration

### 1.3.0 — 2026-07-13

**New**
- Kanban view with drag & drop of tasks between columns
- List view pagination
- Instant accent/case-insensitive search
- Priority filter (in addition to the status filter)
- Light / dark theme
- Charts expandable to full screen
- Celebration animation with sound when every task is done
  (5 random variants + a rare legendary one, 1/1000)

**Improvements**
- Explicit confirmation before deleting a task
- New FR/EN translations for all the features above

### 1.2.0 — 2026-07-12

- Export / import of all data as a single JSON file, using the OS's native
  file dialogs

### 1.1.0 — 2026-07-11

- Bilingual FR/EN interface with language switcher

### 1.0.0-beta — 2026-07-11

**Initial release**
- Task tracking per project: priorities, due dates, status, time spent
- Gantt view and charts (breakdown by status, project, priority, time spent)
- Local JSON file storage next to the executable, portable on a USB key / external SSD (Windows `.exe` + Ubuntu `.AppImage`)
- Automatic fallback to the user folder when the location isn't writable
- Automated builds via GitHub Actions
