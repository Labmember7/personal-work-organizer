# Format d'extension `trk.extension/2`

> Spécification du format de plugin de deuxième génération : un **paquet
> multi-fichiers** avec `manifest.json` et **points de contribution**, sur le
> modèle des extensions de navigateur / VS Code, plus un **tier déclaratif sans
> code** pour les plugins simples.
>
> Remplace le modèle « un plugin = un fichier `.html` » (`apiVersion 1`, cf.
> `PLUGIN_PLAN.md`). Les plugins v1 continuent de fonctionner sans modification.

---

## 1. Pourquoi changer

Constats sur le format v1 tel qu'il est dans le dépôt :

| Limite v1 | Conséquence mesurable |
|---|---|
| Un seul fichier HTML, manifeste dans `<script type="application/json">` | `plugins/mindmap.html` fait **118 Ko** : moteur SVG, CSS, i18n, UI et données dans un seul fichier. Illisible, non testable, non revuable en diff. |
| CSP servie : `script-src 'unsafe-inline'` (`electron/plugins.js`) | Aucune sous-ressource possible : ni module ES, ni `import`, ni CSS séparé, ni image livrée avec le plugin. Tout doit être inliné à la main. |
| Origine opaque partagée (`app-plugin://local/<fichier>`) | Aucune séparation entre plugins, `'self'` ne désigne rien d'utilisable. |
| Pas d'outillage | Pas de `dev`, pas de rechargement à chaud, pas de validation hors exécution, pas de schéma d'éditeur. Boucle de développement = relancer l'app. |
| Pas d'unité de distribution | Rien à publier, rien à versionner, rien à installer. Un fichier HTML se copie à la main. |
| Le seul point d'extension est « une vue plein cadre » | Un plugin ne peut pas ajouter une colonne, une commande de barre d'outils, un panneau de tâche, un réglage. Chaque nouveau besoin = un nouveau fichier HTML complet. |
| Tout plugin doit écrire du JS | « Ajouter une vue tableau de la charge par projet » coûte aujourd'hui plusieurs centaines de lignes. C'est la barrière d'entrée principale pour une communauté. |

Les deux décisions arbitrées en v1 sont **conservées telles quelles** :

1. **Chargement à l'exécution**, jamais de plugin compilé dans le bundle.
2. **Références en lecture seule** : aucun canal de mutation dans le protocole.
   Un plugin ne crée ni ne modifie jamais une tâche. `task:reveal` reste de la
   navigation.

---

## 2. Décisions de conception

| Décision | Choix | Motif |
|---|---|---|
| Unité de plugin | **Un dossier** `plugins/<id>/` avec `manifest.json`, ou un `.trkx` (zip) qui se décompresse en ce dossier | Un manifeste séparé se valide, se versionne et s'indexe sans parser du HTML. |
| Langage | **JSON + JS standard**, pas de syntaxe inventée, **plus** un DSL déclaratif (`.trkv`) pour le tier sans code | Une syntaxe nouvelle est une barrière, pas un facilitateur. Le seul endroit où un langage propre se justifie est la description déclarative d'une vue, parce qu'elle remplace du code. |
| Origine | **Une origine par plugin** : `app-plugin://<id>/` | Rend `'self'` utilisable → modules ES, CSS et assets séparés, CSP sans `unsafe-inline`. Cloisonne les plugins entre eux. |
| Sandbox | `sandbox="allow-scripts allow-same-origin"` | `allow-same-origin` n'est dangereux que si le document encadré partage l'origine de l'encadrant. Ici l'hôte est `file:`/`localhost` et le plugin `app-plugin://<id>` : le plugin **ne peut pas** atteindre le DOM parent ni retirer son propre sandbox. En échange, tout devient du développement web normal. |
| Extension | **Points de contribution déclarés** (`contributes`) plutôt qu'un unique cadre plein écran | C'est ce qui permet à dix plugins de coexister utilement au lieu de dix vues concurrentes. |
| Permissions | Renommage de `capabilities` → `permissions`, **consentement à l'installation** et re-consentement si une mise à jour en ajoute | Modèle navigateur. Indispensable dès qu'un plugin vient d'un tiers. |
| Compatibilité | Le chargeur reconnaît `*.html` (v1) **et** `*/manifest.json` (v2) | `mindmap.html` ne casse pas pendant la migration. |

---

## 3. Le paquet

```
plugins/
  mindmap/                        ← un plugin = un dossier
    manifest.json                 ← seul fichier obligatoire
    main.js                       ← module ES, point d'entrée déclaré
    engine/
      layout.js
      render.js
    ui/
      inspector.js
      style.css
    views/
      board.html                  ← document de la vue (facultatif : généré si absent)
      charge.trkv                 ← vue déclarative, aucun JS
    _locales/
      fr.json
      en.json
    assets/
      icon.svg
    migrations.js                 ← migrations de `data` entre `dataVersion`
    README.md
    CHANGELOG.md
```

Distribution : `mindmap-2.0.0.trkx` = ce dossier zippé, `manifest.json` à la
racine de l'archive. Extension propre pour l'association de fichier et le
glisser-déposer d'installation.

**Chemins** : toute ressource est résolue relativement à la racine du plugin.
Le serveur refuse `..`, les chemins absolus, et vérifie par `fs.realpath` que la
cible reste dans le dossier du plugin (un lien symbolique ne doit pas permettre
de sortir).

---

## 4. `manifest.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/<repo>/main/schema/trk-manifest-2.json",
  "format": "trk.extension/2",

  "id": "mindmap",
  "version": "2.0.0",
  "publisher": "bzarai",
  "license": "MIT",
  "homepage": "https://github.com/bzarai/trk-mindmap",

  "engines": { "api": 2, "app": ">=2.0.0" },

  "name":        { "fr": "Carte mentale", "en": "Mind map" },
  "description": { "fr": "Feuille de route arborescente.", "en": "Tree roadmap." },
  "icon": "assets/icon.svg",
  "categories": ["planning", "visualisation"],
  "keywords": ["mindmap", "roadmap"],

  "permissions": ["doc", "tasks:read", "task:reveal", "file:save", "toast", "fullscreen"],

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
      {
        "id": "mindmap.exportPng",
        "title": { "fr": "Exporter en PNG", "en": "Export as PNG" },
        "icon": "Image",
        "when": "view == 'board'"
      }
    ],

    "taskColumns": [
      {
        "id": "mindmap.node",
        "label": { "fr": "Nœud", "en": "Node" },
        "value": "refs | first('mindmap.doc') | default('—')",
        "width": "10rem"
      }
    ],

    "taskPanels": [
      {
        "id": "mindmap.related",
        "title": { "fr": "Sur la carte", "en": "On the map" },
        "kind": "declarative",
        "spec": "views/related.trkv"
      }
    ],

    "settings": {
      "mindmap.curve": {
        "type": "enum",
        "values": ["elbow", "bezier"],
        "default": "elbow",
        "label": { "fr": "Style de lien", "en": "Link style" }
      },
      "mindmap.autosaveMs": { "type": "number", "default": 300, "min": 0, "max": 5000 }
    }
  }
}
```

### Champs

| Champ | Règle |
|---|---|
| `format` | Littéral `"trk.extension/2"`. Discrimine v1/v2 sans heuristique. |
| `id` | `^[a-z0-9][a-z0-9-]{0,39}$`. Préfixe des clés de stockage et **nom d'hôte de l'origine** → doit rester un label DNS valide. |
| `publisher` | Même grammaire que `id`. L'identité publiable est `publisher.id`, ce qui évite les collisions dans un registre. |
| `engines.api` | Entier. Refusé si `> PLUGIN_API_VERSION` (motif `api-too-new`), comme en v1. |
| `engines.app` | Plage semver comparée à `package.json#version`. Refus explicite plutôt que plantage à l'usage. |
| `permissions` | Une entrée inconnue est **ignorée**, pas fatale (règle v1 conservée : un plugin écrit pour une version plus récente reste partiellement utilisable). |
| `locales` | Un fichier plat `{ "clé": "texte" }` par langue. Fusionné avec le dictionnaire de l'hôte, le plugin gagne sur ses propres clés. Remplace le passage du `dict` complet de l'hôte. |
| `contributes` | Toutes les sections sont facultatives. Une section inconnue est ignorée. |

### Permissions

Les 7 capacités v1 sont reprises à l'identique (`doc`, `tasks:read`,
`task:reveal`, `file:save`, `toast`, `fullscreen`, `debug`) plus :

| Permission | Ce qu'elle ouvre |
|---|---|
| `commands` | Contribuer des commandes à la barre d'outils de sa vue. |
| `settings` | Lire ses propres réglages (`contributes.settings`) et être notifié de leur changement. |
| `columns` | Contribuer une colonne à la liste des tâches. |
| `panels` | Contribuer un panneau dans le modal d'édition d'une tâche. |
| `state` | Un espace clé/valeur privé, hors document (viewport, replis, préférences locales). Clés `plugin-state:<id>:<clé>`, quota 64 Ko. |

**Aucune permission d'écriture sur les entités de l'app.** Le protocole n'a
toujours pas de message de mutation : c'est une propriété du format, pas une
politique.

Libellés de consentement (`i18n`, préfixe `perm_*`) affichés à l'installation :
« Lire vos tâches et projets (sans les modifier) », « Enregistrer des fichiers
que vous choisissez », etc. Une mise à jour qui ajoute une permission est
installée **désactivée** jusqu'à re-consentement.

---

## 5. Les deux natures de plugin

### `kind: "declarative"` — aucun code

Rendu **par l'hôte**, pas dans une iframe. Pas de JS, pas de CSP à négocier, pas
de pont `postMessage`. Le plugin décrit *quoi* afficher ; l'hôte réutilise ses
composants existants (tableau, kanban, jauges, Recharts).

`views/charge.trkv` (YAML ou JSON, même schéma) :

```yaml
spec: trk.view/1
source: tasks                      # tasks | projects | doc
where: not archived and statut != "annule"
group: projet
sort: -minutes
layout:
  type: table                      # table | cards | board | timeline | chart | stats
  columns:
    - label: { fr: Projet, en: Project }
      value: group
    - label: { fr: Tâches, en: Tasks }
      value: count(items)
    - label: { fr: Pointé, en: Logged }
      value: sum(items.minutes) | duration
    - label: { fr: Avancement, en: Progress }
      value: avg(items.weight) | round
      as: gauge                    # text | badge | gauge | date | duration | taskLink
```

Ce que cela coûte à un contributeur : **un fichier de 20 lignes**. C'est le
levier principal pour une communauté ; le tier `app` reste là pour le reste.

Une vue déclarative n'a besoin d'aucune permission au-delà de `tasks:read`
(implicite pour `source: tasks`), et ne peut par construction rien faire d'autre
que lire et afficher.

### `kind: "app"` — module ES dans une iframe

`views/board.html` :

```html
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="../ui/style.css">
<div id="root"></div>
<script type="module" src="../main.js"></script>
```

`main.js` :

```js
import trk from "trk:sdk";                    // module virtuel servi par l'hôte
import { layout } from "./engine/layout.js";  // import relatif : enfin possible

const { doc, snapshot, settings } = await trk.ready();
trk.on("doc", render);
trk.commands.on("mindmap.exportPng", exportPng);
```

`trk:sdk` est résolu par le serveur de protocole vers le SDK livré avec l'app
(un vrai module ES, versionné avec l'hôte) via une carte d'imports injectée dans
le document, ou directement par `import "/@trk/sdk.js"`. Le plugin n'embarque
jamais le SDK : il suit l'app.

---

## 6. Le langage d'expression `trkx`

Nécessaire pour `where`, `sort`, `value`, `when`, `as`. Contraintes : **jamais
d'`eval`**, pas d'accès aux globales, évaluation totale (aucune boucle),
échec silencieux en `undefined` plutôt qu'exception.

```
expr    := or
or      := and ("or" and)*
and     := cmp ("and" cmp)*
cmp     := unary (("=="|"!="|">"|">="|"<"|"<="|"in"|"matches") unary)?
unary   := "not" unary | primary
primary := number | string | "true" | "false" | "null"
         | call | path | "(" expr ")"
call    := ident "(" (expr ("," expr)*)? ")"
path    := ident ("." ident | "[" number "]")*
pipe    := primary ("|" ident ("(" args ")")?)*
```

Fonctions et filtres : liste **close**, une table de fonctions pures.

| Catégorie | Entrées |
|---|---|
| Agrégats | `count sum avg min max first last` |
| Texte | `upper lower trim join truncate default` |
| Nombre | `round percent` |
| Date | `date age overdue` |
| Durée | `duration` (minutes → `3 h 20`) |
| Liste | `filter sort unique groupBy` |

Implémentation : `src/lib/plugins/expr.ts`, analyseur descendant récursif,
~200 lignes, pur, testé exhaustivement (`expr.test.ts`). Aucune dépendance.
Le même évaluateur sert les vues déclaratives, les `when` de commandes et les
colonnes contribuées — un seul langage à apprendre et à documenter.

---

## 7. Chaîne de confiance v2

```
Origine par plugin        app-plugin://<id>/…            (host = id du manifeste)
iframe                    sandbox="allow-scripts allow-same-origin"
CSP servie par l'hôte     default-src 'none';
                          script-src 'self';
                          style-src 'self' 'unsafe-inline';
                          img-src 'self' data: blob:;
                          font-src 'self' data:;
                          connect-src 'self';          ← ses propres fichiers, jamais le réseau
                          form-action 'none'; base-uri 'none'; frame-ancestors 'self'
vite.config.js            frame-src 'self' app-plugin:  (inchangé)
```

Gains par rapport à v1 :

1. **Plus de `script-src 'unsafe-inline'`** — le vecteur le plus large de v1
   disparaît, parce qu'un fichier séparé peut enfin être servi.
2. **Cloisonnement inter-plugins** : `'self'` = `app-plugin://<id>` uniquement.
   Un plugin ne peut pas charger le code d'un autre.
3. `connect-src 'self'` autorise un plugin à lire **ses** fichiers livrés
   (données de référence, gabarits) tout en gardant le réseau fermé.

Ce qui ne change pas : authentification des messages par
`event.source === iframeRef.current.contentWindow` (l'origine reste inutilisable
comme preuve), validation `ns` / `protocol` / `pluginId` / forme / permission
dans `lib/plugins/bridge.ts`, aucun accès disque ni IPC depuis l'iframe.

Ce que `allow-same-origin` concède : le plugin obtient `localStorage` /
`IndexedDB` **dans sa propre origine**, cloisonnés par plugin et hors du store
de l'app. À documenter ; ce n'est pas un canal vers les données de l'app.

> ⚠️ Point à valider par un pointe technique avant de figer (§ 11, phase 0) :
> le comportement exact d'Electron sur un scheme `standard` avec hôtes
> multiples (`app-plugin://mindmap/`) et le chargement des modules ES depuis
> ce contexte. Variante de repli si nécessaire : conserver l'origine opaque
> (`sandbox="allow-scripts"` seul) et remplacer `'self'` par la source explicite
> `app-plugin://<id>` dans la CSP, avec `Access-Control-Allow-Origin: *` sur les
> réponses du protocole. Le format ne change pas, seul le câblage change.

---

## 8. Protocole v2 (`protocol: 2`)

Tous les messages v1 sont conservés à l'identique. Ajouts :

| Hôte → plugin | Charge | Permission |
|---|---|---|
| `host:settings` | `settings: Record<string, unknown>` | `settings` |
| `host:command` | `id, args?` — une commande contribuée a été déclenchée | `commands` |
| `host:state` | `entries: Record<string, unknown>` | `state` |
| `host:reload` | — (le fichier a changé sur disque, mode développement) | — |

| Plugin → hôte | Charge | Permission |
|---|---|---|
| `plugin:state:set` | `key, value` (quota 64 Ko par plugin) | `state` |
| `plugin:command:enable` | `id, enabled` | `commands` |
| `plugin:manifest:error` | `detail` — le plugin refuse son propre document | — |

`host:init` gagne `settings`, `state`, `contributes` (résolu), et remplace
`dict` (dictionnaire complet de l'hôte) par les locales du plugin fusionnées
avec le sous-ensemble `plugin_*` de l'hôte.

Négociation de version : le manifeste annonce `engines.api`. L'hôte parle le
protocole demandé s'il le connaît (`1` ou `2`), donc un plugin v1 reçoit
exactement les messages v1. Une seule branche dans `bridge.ts`, pas deux ponts.

---

## 9. Outillage — la vraie condition du « facile à développer »

### `npx create-trk-plugin` / `trk-plugin` (CLI, paquet séparé)

| Commande | Effet |
|---|---|
| `init` | Génère un squelette (`declarative` ou `app`), avec `manifest.json`, locales, README, licence. |
| `validate` | Valide le manifeste contre le JSON Schema, les `.trkv` contre `trk.view/1`, les expressions `trkx` (analyse statique), les chemins de ressources, les clés de locales manquantes. Sortie exploitable en CI. |
| `dev` | Surveille le dossier et pousse `host:reload` : **la boucle de développement passe de « relancer l'app » à « enregistrer le fichier »**. |
| `pack` | Produit `<publisher>.<id>-<version>.trkx` + `sha256`. Refuse de packer si `validate` échoue. |

Côté app : IPC `plugins:watch(id)` → `fs.watch` sur le dossier → `host:reload`,
actif uniquement hors production.

### JSON Schema publié

`schema/trk-manifest-2.json` et `schema/trk-view-1.json`. Avec `$schema` dans le
manifeste, n'importe quel éditeur donne l'autocomplétion, la validation et la
documentation au survol — sans que le contributeur lise une ligne de spec.

### Console de plugin

La permission `debug` existe déjà (relais `console.*` → hôte). L'étendre en un
panneau de développement dans la vue Plugins : messages du protocole dans les
deux sens, permissions refusées, erreurs de manifeste, dernier `doc` reçu.

---

## 10. Distribution communautaire

| Brique | Format |
|---|---|
| Installation | Glisser un `.trkx` sur la fenêtre, ou `Plugins → Installer`. Décompression dans `plugins/<publisher>.<id>/`, `validate`, écran de consentement des permissions, puis activation. |
| Mise à jour | Comparaison semver ; une permission ajoutée ⇒ installée désactivée jusqu'à consentement. |
| Registre | Un simple `index.json` versionné dans un dépôt Git : `[{ publisher, id, version, name, description, categories, permissions, sha256, url, screenshots }]`. Pas de serveur à tenir, une PR suffit pour publier. |
| Intégrité | `sha256` vérifié à l'installation. Signature : hors périmètre pour l'instant, à prévoir dans le format (`signature` facultatif au niveau de l'index). |
| Désinstallation | Suppression du dossier + purge des clés `plugin-doc:<id>:*` et `plugin-state:<id>:*`, avec export proposé avant. |

---

## 11. Migration

### Compatibilité

`discoverPlugins()` produit une liste unifiée à partir de deux sources :

- `plugins/*.html` → `parseManifestV1` (le code actuel, inchangé) → `apiVersion: 1`
- `plugins/*/manifest.json` → `parseManifestV2` → `format: "trk.extension/2"`

`PluginSource` gagne `format: 1 | 2` et `root: string`. Les couches au-dessus
(`usePluginDocs`, `usePluginHost`, `PluginsSection`) travaillent sur ce type
normalisé et ignorent la génération, sauf `usePluginHost` qui choisit le
dialecte du protocole.

### `mindmap.html` (118 Ko) → `plugins/mindmap/`

Découpage sans réécriture du moteur, qui fonctionne :

| Cible | Contenu extrait |
|---|---|
| `engine/layout.js` | `walk index branchOf colorOf passFilter actionables ranks visible kids normDeps anchorPt nearestAnchor anchorsFor applyOff wrap size measure place layout` |
| `engine/render.js` | `elbow curve nodeSVG cardSVG renderFlow render isShown fit` |
| `ui/pointer.js` | Gestionnaire de pointeur unique (pan/zoom, glisser, redimensionner, poignées, repli) |
| `ui/inspector.js` | Inspecteur, panneau de lien, recherche de tâche liée |
| `ui/style.css` | Tout le CSS inline |
| `_locales/{fr,en}.json` | Les `TrkPlugin.t("clé", "repli")` deviennent de vraies locales de plugin ; les clés `plugin_mindmap_*` sortent de `src/i18n/{fr,en}.ts`. |
| `views/charge.trkv` | Ajout gratuit : la vue synthèse actuelle redevient déclarative. |

`dataVersion` reste `2` ; `data = { root, view?, folded?[] }` inchangé, donc
**aucune migration de document** : les documents existants sous
`plugin-doc:mindmap:<id>` s'ouvrent tels quels.

---

## 12. Plan d'exécution

**Phase 0 — pointe technique (bloquante, ~1 fichier jetable)**
Vérifier dans Electron 31 : scheme `app-plugin` `standard` avec plusieurs hôtes,
`allow-same-origin` + CSP `'self'`, chargement d'un module ES et d'un `import`
relatif. Trancher entre l'origine nominale et la variante opaque (§ 7).

**Phase 1 — logique pure, aucun changement visible**
`lib/plugins/manifest2.ts` (validation + JSON Schema), `lib/plugins/expr.ts`
(langage `trkx`), `lib/plugins/viewSpec.ts` (`trk.view/1`), leurs tests.
`npm test` vert avant de continuer.

**Phase 2 — chargeur et service**
`electron/plugins.js` : découverte des dossiers, résolution de ressource avec
garde `realpath`, CSP par plugin. `main.js` : `protocol.handle("app-plugin")`
par hôte + type MIME par extension. `services/plugins.ts` : liste unifiée
v1 + v2.

**Phase 3 — le tier déclaratif**
`features/plugins/DeclarativeView.jsx` sur les composants existants. Un plugin
d'exemple `plugins/charge/` de 2 fichiers. **C'est le jalon qui rend la
communauté possible** — à livrer avant le tier `app`.

**Phase 4 — le tier `app`**
SDK v2 en module ES, protocole `2` dans `bridge.ts` et `usePluginHost.ts`,
`host:settings` / `host:command` / `host:state` / `host:reload`.

**Phase 5 — points de contribution**
Commandes, colonnes de tâche, panneaux de tâche, réglages. Chacun est
indépendant et livrable seul.

**Phase 6 — outillage**
CLI `trk-plugin`, JSON Schema publiés, `plugins:watch`, console de plugin.

**Phase 7 — migration de `mindmap`** puis **phase 8 — distribution**
(installation `.trkx`, consentement, `index.json`).

Chaque phase finit par `npm run typecheck && npm run lint && npm test`, et
`ARCHITECTURE.md` mis à jour.

---

## 13. Définition du terminé

- [ ] Un dossier avec `manifest.json` valide déposé dans `plugins/` apparaît
      sans recompilation ; un `.html` v1 fonctionne toujours.
- [ ] Un plugin de 2 fichiers, **sans une ligne de JS**, ajoute une vue
      exploitable des tâches.
- [ ] Un plugin `app` charge un module ES et un `import` relatif, avec une CSP
      **sans `script-src 'unsafe-inline'`**.
- [ ] Un plugin ne peut charger aucune ressource d'un autre plugin ni du réseau.
- [ ] Aucun chemin de code ne permet à un plugin de créer ou modifier une tâche.
- [ ] `trk-plugin validate` rejette : manifeste invalide, `engines` incompatible,
      chemin sortant du paquet, expression `trkx` inconnue, clé de locale absente.
- [ ] `trk-plugin dev` : enregistrer un fichier recharge le plugin dans l'app.
- [ ] Installer un `.trkx` affiche les permissions demandées en français clair
      et n'active rien avant consentement.
- [ ] `mindmap` migré, documents existants ouverts sans migration.
- [ ] `typecheck`, `lint`, `test` verts ; `ARCHITECTURE.md` à jour.
