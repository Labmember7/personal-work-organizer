# Annexe B — Anatomie d'un plugin, en détail

> À quoi ressemble un plugin `trk.extension/2` fichier par fichier, ce que
> l'hôte en fait à chaque étape, et où vit chaque octet.
>
> Complète `PLUGIN_FORMAT_V2.md` § 3-5.

---

## B.1 Les deux formes, en une image

```
┌──────────────────────────── plugin déclaratif ────────────────────────────┐
│ 4 fichiers, 0 ligne de JS                                                 │
│ rendu PAR L'HÔTE (composants React existants)                             │
│ pas d'iframe, pas d'origine, pas de CSP, pas de postMessage               │
│ ne peut structurellement rien faire d'autre que lire et afficher          │
└───────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────── plugin app ───────────────────────────────┐
│ n fichiers, modules ES, CSS et assets séparés                             │
│ rendu DANS UNE IFRAME, origine app-plugin://<id>, CSP dérivée des         │
│ permissions, un seul canal : postMessage validé côté hôte                 │
└───────────────────────────────────────────────────────────────────────────┘
```

Le choix n'est pas une préférence de style : il détermine la surface de
confiance. Un contributeur qui n'a pas besoin d'un moteur de rendu propre ne
devrait jamais entrer dans le tier `app`.

---

## B.2 Un plugin déclaratif complet

Objectif : une vue « charge par projet », triée, avec pointé cumulé et
avancement moyen. C'est le genre de plugin qui devrait représenter 80 % d'un
écosystème.

### Arborescence

```
plugins/charge/
  manifest.json
  views/charge.trkv
  _locales/fr.json
  _locales/en.json
```

### `manifest.json`

```json
{
  "$schema": "../../schema/trk-manifest-2.json",
  "format": "trk.extension/2",

  "id": "charge",
  "version": "1.0.0",
  "publisher": "bzarai",
  "license": "MIT",

  "engines": { "api": 2, "app": ">=2.0.0" },

  "name": { "fr": "Charge par projet", "en": "Load per project" },
  "description": {
    "fr": "Pointé cumulé et avancement moyen, par projet.",
    "en": "Logged time and average progress, per project."
  },
  "icon": "BarChart3",

  "permissions": ["tasks:read"],
  "locales": { "dir": "_locales", "default": "fr" },

  "contributes": {
    "views": [
      {
        "id": "charge",
        "title": { "fr": "Charge", "en": "Load" },
        "icon": "BarChart3",
        "kind": "declarative",
        "spec": "views/charge.trkv",
        "scopes": ["global", "project"]
      }
    ]
  }
}
```

`icon` accepte soit un nom `lucide-react` (aucun fichier à livrer, cohérent avec
le reste de l'app), soit un chemin vers un `.svg` du paquet.

### `views/charge.trkv`

```yaml
spec: trk.view/1

source: tasks
where: not archived
group: projet
sort: -sum(items, 'minutes')

empty:
  fr: Aucune tâche active.
  en: No active task.

layout:
  type: table
  columns:
    - label: { fr: Projet, en: Project }
      value: group
      as: text
      width: 1fr

    - label: { fr: Tâches, en: Tasks }
      value: count(items)
      as: text
      align: right
      width: 6rem

    - label: { fr: Terminées, en: Done }
      value: count(filter(items, it.done))
      as: text
      align: right
      width: 8rem

    - label: { fr: Pointé, en: Logged }
      value: sum(items, 'minutes') | duration
      as: text
      align: right
      width: 8rem

    - label: { fr: En retard, en: Overdue }
      value: count(filter(items, overdue(it.echeance) and not it.done))
      as: badge
      tone: "if(count(filter(items, overdue(it.echeance) and not it.done)) > 0, 'danger', 'muted')"
      align: right
      width: 8rem

    - label: { fr: Avancement, en: Progress }
      value: round(avg(items, 'weight'))
      as: gauge
      width: 12rem

  footer:
    - value: t('total', 'Total')
    - value: count(tasks)
    - value: count(filter(tasks, it.done))
    - value: sum(tasks, 'minutes') | duration
    - value: ""
    - value: round(avg(tasks, 'weight'))
```

### `_locales/fr.json`

```json
{
  "total": "Total",
  "late": "En retard"
}
```

`_locales/en.json` : mêmes clés. Une clé absente retombe sur la langue
`locales.default` du plugin, puis sur la clé brute — même politique de repli que
`src/i18n/index.tsx`, donc aucun écran vide à cause d'une traduction oubliée.

### Ce que ça produit

Un onglet dans la vue Plugins, rendu par le composant `DeclarativeView` de
l'hôte, qui réutilise le tableau, les badges et les jauges existants. Thème,
langue et portée projet suivent l'app sans une ligne de code du plugin.

**Total : 4 fichiers, ~70 lignes, aucune permission au-delà de la lecture.**

---

## B.3 Un plugin `app` complet

`mindmap` après migration. Le moteur n'est pas réécrit, il est découpé.

### Arborescence

```
plugins/mindmap/
  manifest.json            manifeste, seul fichier obligatoire
  views/
    board.html             document de la vue (chargé dans l'iframe)
    charge.trkv            vue déclarative bonus, dans le même paquet
  main.js                  point d'entrée module ES
  engine/
    layout.js              walk index branchOf colorOf ranks visible kids
                           normDeps anchorPt anchorsFor wrap size measure place layout
    render.js              elbow curve nodeSVG cardSVG renderFlow render isShown fit
  ui/
    pointer.js             pan/zoom, glisser, redimensionner, poignées, repli
    inspector.js           inspecteur, panneau de lien, recherche de tâche liée
    style.css
  migrations.js            migrations de `data` entre dataVersion
  _locales/{fr,en}.json
  assets/icon.svg
  README.md
  CHANGELOG.md
  LICENSE
```

Un paquet peut mélanger les deux tiers : `views/charge.trkv` est déclaratif,
`views/board.html` est une app. Les permissions sont déclarées **au niveau du
paquet**, mais une vue déclarative n'a accès qu'au sous-ensemble lecture, quoi
que déclare le manifeste.

### `manifest.json`

```json
{
  "$schema": "../../schema/trk-manifest-2.json",
  "format": "trk.extension/2",

  "id": "mindmap",
  "version": "2.0.0",
  "publisher": "bzarai",
  "license": "MIT",
  "homepage": "https://github.com/bzarai/trk-mindmap",

  "engines": { "api": 2, "app": ">=2.0.0" },

  "name": { "fr": "Carte mentale", "en": "Mind map" },
  "description": {
    "fr": "Feuille de route arborescente, liens en lecture seule vers les tâches.",
    "en": "Tree roadmap with read-only links to tasks."
  },
  "icon": "assets/icon.svg",
  "categories": ["planning", "visualisation"],
  "keywords": ["mindmap", "roadmap", "feuille de route"],

  "permissions": ["doc", "state", "tasks:read", "task:reveal", "file:save", "toast", "fullscreen", "commands"],
  "locales": { "dir": "_locales", "default": "fr" },

  "contributes": {
    "docTypes": [
      { "id": "mindmap.doc", "dataVersion": 2, "migrations": "migrations.js" }
    ],

    "views": [
      {
        "id": "board",
        "title": { "fr": "Carte", "en": "Board" },
        "icon": "Network",
        "kind": "app",
        "entry": "views/board.html",
        "docType": "mindmap.doc",
        "scopes": ["global", "project"],
        "singleton": false
      },
      {
        "id": "charge",
        "title": { "fr": "Charge", "en": "Load" },
        "icon": "BarChart3",
        "kind": "declarative",
        "spec": "views/charge.trkv"
      }
    ],

    "commands": [
      { "id": "mindmap.exportPng",  "title": { "fr": "Exporter en PNG",  "en": "Export as PNG" },  "icon": "Image",    "when": "view.id == 'board'" },
      { "id": "mindmap.exportJson", "title": { "fr": "Exporter en JSON", "en": "Export as JSON" }, "icon": "Download", "when": "view.id == 'board'" },
      { "id": "mindmap.fit",        "title": { "fr": "Recadrer",         "en": "Fit" },            "icon": "Maximize", "when": "view.id == 'board'" }
    ],

    "taskColumns": [
      {
        "id": "mindmap.node",
        "label": { "fr": "Carte", "en": "Map" },
        "value": "task.id in doc.refs.task",
        "as": "badge",
        "width": "6rem"
      }
    ],

    "settings": {
      "mindmap.curve": {
        "type": "enum",
        "values": ["elbow", "bezier"],
        "default": "elbow",
        "label": { "fr": "Style de lien", "en": "Link style" }
      },
      "mindmap.autosaveMs": {
        "type": "number", "default": 300, "min": 0, "max": 5000,
        "label": { "fr": "Délai d'enregistrement (ms)", "en": "Autosave delay (ms)" }
      },
      "mindmap.showTaskStatus": {
        "type": "boolean", "default": true,
        "label": { "fr": "Afficher le statut des tâches liées", "en": "Show linked task status" }
      }
    }
  }
}
```

### `views/board.html`

```html
<!doctype html>
<meta charset="utf-8">
<title>mindmap</title>
<link rel="stylesheet" href="../ui/style.css">
<div id="bar"></div>
<div id="canvas"></div>
<script type="module" src="../main.js"></script>
```

Onze lignes, contre 118 Ko de HTML monolithique en v1. C'est tout le sujet :
`<link rel="stylesheet">` et `<script type="module">` sont impossibles sous la
CSP v1 (`script-src 'unsafe-inline'`, origine opaque partagée).

### `main.js`

```js
// Point d'entrée du plugin. Le SDK est résolu par l'hôte : jamais embarqué
// dans le paquet, il suit la version de l'app.
import trk from "trk:sdk";
import { layout } from "./engine/layout.js";
import { render } from "./engine/render.js";
import { bindPointer } from "./ui/pointer.js";
import { openInspector } from "./ui/inspector.js";

const init = await trk.ready();          // résolu au premier host:init

let model = init.doc?.data ?? { root: { id: "root", label: trk.t("newMap", "Nouvelle carte") } };
let view = await trk.state.get("view", { z: 1, x: 0, y: 0 });

function draw() {
  render(document.getElementById("canvas"), layout(model), {
    tasks: trk.tasks(),                                  // projection en lecture seule
    curve: trk.settings["mindmap.curve"],
    showStatus: trk.settings["mindmap.showTaskStatus"],
    theme: trk.theme,
  });
}

function mutate(fn) {
  fn(model);
  draw();
  trk.save({ data: model, refs: collectRefs(model) });   // débouncé côté hôte
}

trk.on("doc",      (doc) => { model = doc?.data ?? model; draw(); });
trk.on("snapshot", draw);                                 // une tâche a changé de statut
trk.on("theme",    draw);                                 // applyTheme est automatique
trk.on("settings", draw);

trk.commands.on("mindmap.exportPng",  exportPng);
trk.commands.on("mindmap.exportJson", () =>
  trk.saveFile({ name: `${init.doc.title}.json`, mime: "application/json", text: JSON.stringify(model, null, 2) }));
trk.commands.on("mindmap.fit", () => { view = fit(); trk.state.set("view", view); });

bindPointer(document.getElementById("canvas"), { onMutate: mutate, onInspect: openInspector });
draw();
```

Ce que ce fichier montre du contrat :

- `import` relatif et `trk:sdk` : le paquet est du code normal, testable hors
  application avec du Vitest et un faux `trk`.
- `trk.tasks()` rend une projection, jamais une `Task`. Aucune fonction
  d'écriture n'existe sur `trk` — ce n'est pas un oubli, il n'y a pas de message
  de mutation dans le protocole.
- `trk.state` (permission `state`) porte ce qui n'appartient pas au document :
  le viewport. Le document reste propre et partageable.
- `refs` est **recalculé** à chaque enregistrement et remonté à l'hôte, qui sait
  ainsi quelles tâches le document référence sans lire `data`.

### `migrations.js`

```js
// Migrations du champ `data`. L'hôte appelle la chaîne au chargement d'un
// document dont `dataVersion` est inférieure à celle du manifeste, dans une
// worker-frame sans permission, et n'enregistre le résultat que s'il valide.
export default {
  1: function toV2(data) {
    // v1 : `deps` acceptait une chaîne. v2 : toujours un objet.
    walk(data.root, (n) => {
      if (Array.isArray(n.deps)) n.deps = n.deps.map((d) => (typeof d === "string" ? { id: d } : d));
    });
    return data;
  },
};
```

Une migration qui lève, qui dépasse son budget de temps, ou qui rend autre chose
qu'un objet sérialisable : le document est ouvert **en lecture seule** avec un
avertissement, jamais écrasé. Perdre les données d'un utilisateur parce qu'un
tiers a écrit une migration fausse n'est pas acceptable.

---

## B.4 Cycle de vie

```
1  DÉCOUVERTE        electron/plugins.js parcourt plugins/*/manifest.json et
                     plugins/*.html (v1). Lit les octets, ne valide rien.
                        ↓
2  VALIDATION        lib/plugins/manifest2.ts : format, id, engines.api,
                     engines.app vs package.json#version, permissions,
                     contributes, existence de chaque chemin déclaré.
                     Échec → entrée dans `errors`, les autres plugins vivent.
                        ↓
3  ANALYSE           chaque .trkv est analysé (expr/analyze.ts) contre la portée
                     de son champ. Échec → la vue n'est pas montée, diagnostic
                     affiché. Le reste du paquet fonctionne.
                        ↓
4  CONSENTEMENT      un paquet dont les permissions ne sont pas déjà accordées
                     est listé mais INACTIF, avec l'écran de consentement.
                     Une mise à jour qui ajoute une permission repasse ici.
                        ↓
5  MONTAGE
   déclaratif  →  DeclarativeView : évaluation + rendu React. Terminé.
   app         →  <iframe src="app-plugin://<id>/views/board.html"
                          sandbox=… allow="" referrerPolicy="no-referrer">
                     ↓
6  HANDSHAKE         plugin:ready  →  host:init { apiVersion, plugin, lang,
                     locales, theme, permissions, contributes, settings, state,
                     doc, snapshot }
                        ↓
7  BOUCLE            host:doc / host:snapshot / host:theme / host:lang /
                     host:settings / host:command / host:saved / host:error
                     ⇅
                     plugin:doc:save / dirty / state:set / snapshot:refresh /
                     task:reveal / toast / file:save / fullscreen / log
                        ↓
8  DÉMONTAGE         flush du dernier patch débouncé, retrait de l'écouteur
                     `message`, iframe retirée du DOM. Aucun état résiduel.
```

Le délai de garde existant (`READY_TIMEOUT_MS = 5000` dans `PluginFrame.jsx`) est
conservé : un plugin qui n'envoie jamais `plugin:ready` affiche un état d'erreur
rechargeable, il ne bloque pas l'app.

---

## B.5 Où vivent les octets

| Donnée | Emplacement | Qui écrit | Format |
|---|---|---|---|
| Code et assets du plugin | `plugins/<id>/` à côté de l'exécutable (`user`) ou de `main.js` (`builtin`) | l'utilisateur / l'installateur | fichiers du paquet |
| Document | `data/store.json`, clé `plugin-doc:<id>:<docId>` | l'hôte, jamais le plugin | `PluginDocument`, `data` opaque |
| État privé | clé `plugin-state:<id>` | l'hôte | `record`, ≤ 64 Ko |
| Réglages | clé `plugin-settings:<id>` | l'hôte (UI de réglages) | valeurs validées contre `contributes.settings` |
| Consentement | clé `plugin-grants:<id>` | l'hôte | `{ version, permissions[], at }` |
| Locales | dans le paquet | — | JSON plat |

Le plugin n'écrit **jamais** sur le disque. Il demande, l'hôte écrit. Trois
conséquences directes : la sauvegarde `data:export` de l'app emporte les
documents de plugins sans code supplémentaire, la désinstallation purge par
préfixe de clé, et aucun plugin ne peut corrompre le store d'un autre.

---

## B.6 Types côté hôte

Ce que le chargeur produit, commun aux deux générations :

```ts
export interface PluginPackage {
  format: 1 | 2;
  manifest: PluginManifest2;       // le v1 est normalisé vers cette forme
  /** Racine sur disque, pour la résolution de ressource. */
  root: string;
  origin: "builtin" | "user";
  /** Base d'URL de l'iframe : `app-plugin://<id>/`. */
  base: string;
  views: ResolvedView[];           // spec .trkv déjà analysée, ou entry résolue
  locales: Record<string, Record<string, string>>;
  grants: PluginCapability[];      // intersection demandé × consenti
  errors: Diagnostic[];            // non bloquants (une vue en échec sur trois)
}
```

Le point important : **`grants`, pas `manifest.permissions`**, est ce que
`bridge.ts` reçoit. Une permission déclarée mais non consentie n'ouvre rien.
En v1, les deux étaient confondus.

---

## B.7 Ce qu'un paquet ne contient jamais

Refusé par `validate`, donc non installable :

- Un binaire, une bibliothèque native, un `node_modules/`.
- Un script d'installation, un `postinstall`, un lanceur.
- Une référence à un domaine distant dans un `src`, un `href`, un `@import`,
  un `url()` — inutile de toute façon, la CSP la bloque, mais autant le dire à
  la publication qu'à l'exécution.
- Un fichier hors de la racine du paquet, ou atteignable par lien symbolique.
- Plus de 200 fichiers, ou 10 Mo au total.

Un paquet est donc, par construction, **des fichiers texte et des images**.
