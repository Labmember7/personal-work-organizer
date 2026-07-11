# Suivi des travaux — app de bureau portable (Windows + Ubuntu)

Cette app tourne en Electron. Le code du dashboard (`src/App.jsx`) est
exactement celui de l'artifact — seul le stockage change : au lieu du
`window.storage` de Claude, un petit fichier `data/store.json` est écrit
juste à côté de l'exécutable, ce qui la rend portable sur ta clé/SSD externe.

## 0. Pré-requis (une seule fois, sur chaque OS où tu vas *builder*)

- Node.js LTS (18+) : https://nodejs.org
- Sur Ubuntu, si tu veux aussi générer le `.exe` Windows depuis Ubuntu : `sudo apt install wine`

## 1. Installer les dépendances

Dans le dossier du projet :

```bash
npm install
```

Ça télécharge Electron, Vite, React, recharts, lucide-react (nécessite internet,
une seule fois).

## 2. Construire les exécutables portables

### Option A — builder séparément sur chaque OS (le plus simple, pas besoin de wine)

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

### Option B — tout construire d'un coup depuis Ubuntu (avec wine installé)

```bash
npm run dist:all
```
→ produit les deux fichiers en une seule commande.

## 3. Installer sur le SSD externe

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

## À propos du dossier `data/`

- **Windows (.exe portable)** : `data/` est créé juste à côté de l'exécutable.
- **Ubuntu (AppImage)** : `data/` est créé à côté du fichier `.AppImage` lui-même
  (l'app détecte le vrai emplacement même si AppImage se monte temporairement
  dans `/tmp` au lancement).
- Si cet emplacement n'est pas accessible en écriture (SSD monté en lecture
  seule, permissions), l'app se rabat automatiquement sur le dossier
  utilisateur standard (`~/.config/SuiviTravaux` sous Linux,
  `%APPDATA%/SuiviTravaux` sous Windows) — dans ce cas les données ne seront
  plus partagées entre les deux OS.

## 4. Lancer l'app

- **Windows** : double-clique sur `SuiviTravaux-Windows.exe`. Rien à installer,
  ça s'exécute directement depuis le SSD.
- **Ubuntu** : rends le fichier exécutable une fois (`chmod +x
  SuiviTravaux-Linux.AppImage`), puis double-clique ou lance
  `./SuiviTravaux-Linux.AppImage`.

## Développement / tests avant de builder

```bash
npm run dev
```
Lance juste le rendu web (dans le navigateur, sans Electron) pour itérer vite
sur le visuel — le stockage fichier ne fonctionne que dans l'app Electron
buildée (`npm start` lance Electron avec le vrai stockage).

## Modifier le dashboard plus tard

Tout le contenu du tracker est dans `src/App.jsx`. Après une modif, il suffit
de refaire `npm run dist:win` / `npm run dist:linux` pour régénérer les
exécutables.
