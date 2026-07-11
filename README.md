# Suivi des travaux / Work Tracker

App de bureau portable (Windows + Ubuntu) pour suivre des tâches par projet, avec échéances, priorités, temps passé et tableaux de bord.
Portable desktop app (Windows + Ubuntu) to track tasks by project, with due dates, priorities, time tracking and dashboards.

[Français](#français) · [English](#english)

## Screenshots

<!--
Drop your PNG/JPG files in docs/screenshots/ with these exact names and they'll show up here automatically.
Suggested shots: main dashboard, task list / gantt view, charts panel.
-->

| Dashboard | Task list | Charts |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Task list](docs/screenshots/tasks.png) | ![Charts](docs/screenshots/charts.png) |

---

## Français

Cette app tourne en Electron. Le code du dashboard (`src/App.jsx`) est
exactement celui de l'artifact — seul le stockage change : au lieu du
`window.storage` de Claude, un petit fichier `data/store.json` est écrit
juste à côté de l'exécutable, ce qui la rend portable sur ta clé/SSD externe.

### Fonctionnalités

- Suivi de tâches par projet, avec priorités, échéances et statut
- Vue gantt et graphiques (répartition par statut, projet, priorité, temps passé)
- Sélecteur de langue intégré (FR/EN)
- Stockage local en fichier JSON, portable sur clé USB / SSD externe

### 0. Pré-requis (une seule fois, sur chaque OS où tu vas *builder*)

- Node.js LTS (18+) : https://nodejs.org
- Sur Ubuntu, si tu veux aussi générer le `.exe` Windows depuis Ubuntu : `sudo apt install wine`

### 1. Installer les dépendances

Dans le dossier du projet :

```bash
npm install
```

Ça télécharge Electron, Vite, React, recharts, lucide-react (nécessite internet,
une seule fois).

### 2. Construire les exécutables portables

#### Option A — builder séparément sur chaque OS (le plus simple, pas besoin de wine)

Sous Ubuntu (dans ce dual-boot) :
```bash
npm run dist:linux
```
→ produit `release/SuiviTravaux-Linux.AppImage`

Sous Windows (même dual-boot, redémarre côté Windows, réinstalle Node.js et `npm install` à nouveau) :
```bash
npm run dist:win
```
→ produit `release/SuiviTravaux-Windows.exe`

#### Option B — tout construire d'un coup depuis Ubuntu (avec wine installé)

```bash
npm run dist:all
```
→ produit les deux fichiers en une seule commande.

### 3. Installer sur le SSD externe

Formate le SSD externe en **exFAT** (lisible/écrivable nativement par Windows
ET Ubuntu — évite NTFS en écriture côté Linux et ext4 illisible côté Windows).

Sur le SSD, crée un dossier, par exemple `SuiviTravaux/`, et mets-y :
```
SuiviTravaux/
├── SuiviTravaux-Windows.exe
└── SuiviTravaux-Linux.AppImage
```

Les deux exécutables créeront chacun un sous-dossier `data/` à côté d'eux au
premier lancement. Comme les deux fichiers sont dans le même dossier, **les
deux OS peuvent utiliser le même dossier `data/`** si tu le souhaites : tes
tâches saisies sous Ubuntu seront visibles sous Windows et vice-versa, tant
que tu ouvres l'app depuis ce même dossier sur le SSD.

### À propos du dossier `data/`

- **Windows (.exe portable)** : `data/` est créé juste à côté de l'exécutable.
- **Ubuntu (AppImage)** : `data/` est créé à côté du fichier `.AppImage` lui-même
  (l'app détecte le vrai emplacement même si AppImage se monte temporairement
  dans `/tmp` au lancement).
- Si cet emplacement n'est pas accessible en écriture (SSD monté en lecture
  seule, permissions), l'app se rabat automatiquement sur le dossier
  utilisateur standard (`~/.config/SuiviTravaux` sous Linux,
  `%APPDATA%/SuiviTravaux` sous Windows) — dans ce cas les données ne seront
  plus partagées entre les deux OS.

### 4. Lancer l'app

- **Windows** : double-clique sur `SuiviTravaux-Windows.exe`. Rien à installer,
  ça s'exécute directement depuis le SSD.
- **Ubuntu** : rends le fichier exécutable une fois (`chmod +x
  SuiviTravaux-Linux.AppImage`), puis double-clique ou lance
  `./SuiviTravaux-Linux.AppImage`.

### Développement / tests avant de builder

```bash
npm run dev
```
Lance juste le rendu web (dans le navigateur, sans Electron) pour itérer vite
sur le visuel — le stockage fichier ne fonctionne que dans l'app Electron
buildée (`npm start` lance Electron avec le vrai stockage).

### Modifier le dashboard plus tard

Tout le contenu du tracker est dans `src/App.jsx`. Après une modif, il suffit
de refaire `npm run dist:win` / `npm run dist:linux` pour régénérer les
exécutables.

---

## English

This app runs on Electron. The dashboard code (`src/App.jsx`) is exactly the
one from the artifact — only the storage changes: instead of Claude's
`window.storage`, a small `data/store.json` file is written right next to the
executable, which makes it portable on your USB key / external SSD.

### Features

- Task tracking per project, with priorities, due dates and status
- Gantt view and charts (breakdown by status, project, priority, time spent)
- Built-in language switcher (FR/EN)
- Local JSON file storage, portable on a USB key / external SSD

### 0. Prerequisites (once, on each OS you'll *build* on)

- Node.js LTS (18+): https://nodejs.org
- On Ubuntu, if you also want to generate the Windows `.exe` from Ubuntu: `sudo apt install wine`

### 1. Install dependencies

In the project folder:

```bash
npm install
```

This downloads Electron, Vite, React, recharts, lucide-react (requires
internet, only once).

### 2. Build the portable executables

#### Option A — build separately on each OS (simplest, no wine needed)

On Ubuntu (in this dual-boot):
```bash
npm run dist:linux
```
→ produces `release/SuiviTravaux-Linux.AppImage`

On Windows (same dual-boot, reboot into Windows, reinstall Node.js and
`npm install` again):
```bash
npm run dist:win
```
→ produces `release/SuiviTravaux-Windows.exe`

#### Option B — build everything at once from Ubuntu (with wine installed)

```bash
npm run dist:all
```
→ produces both files with a single command.

### 3. Install on the external SSD

Format the external SSD as **exFAT** (natively readable/writable by both
Windows and Ubuntu — avoids NTFS write issues on Linux and unreadable ext4 on
Windows).

On the SSD, create a folder, e.g. `SuiviTravaux/`, and put in it:
```
SuiviTravaux/
├── SuiviTravaux-Windows.exe
└── SuiviTravaux-Linux.AppImage
```

Each executable will create its own `data/` subfolder next to itself on first
launch. Since both files live in the same folder, **both OSes can share the
same `data/` folder** if you want: tasks entered under Ubuntu will be visible
under Windows and vice versa, as long as you open the app from that same
folder on the SSD.

### About the `data/` folder

- **Windows (portable .exe)**: `data/` is created right next to the
  executable.
- **Ubuntu (AppImage)**: `data/` is created next to the `.AppImage` file
  itself (the app detects the real location even though the AppImage is
  temporarily mounted under `/tmp` at launch).
- If that location isn't writable (SSD mounted read-only, permissions), the
  app automatically falls back to the standard user folder
  (`~/.config/SuiviTravaux` on Linux, `%APPDATA%/SuiviTravaux` on Windows) —
  in that case data will no longer be shared between the two OSes.

### 4. Launch the app

- **Windows**: double-click `SuiviTravaux-Windows.exe`. Nothing to install,
  it runs directly from the SSD.
- **Ubuntu**: make the file executable once (`chmod +x
  SuiviTravaux-Linux.AppImage`), then double-click it or run
  `./SuiviTravaux-Linux.AppImage`.

### Development / testing before building

```bash
npm run dev
```
Just launches the web render (in the browser, without Electron) to iterate
quickly on the visuals — file storage only works in the built Electron app
(`npm start` launches Electron with real storage).

### Editing the dashboard later

All the tracker content lives in `src/App.jsx`. After a change, just re-run
`npm run dist:win` / `npm run dist:linux` to regenerate the executables.
