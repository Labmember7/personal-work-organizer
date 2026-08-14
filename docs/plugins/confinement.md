# Annexe C — Confinement : n'autoriser que l'API offerte

> Comment on garantit qu'un plugin, y compris écrit par un inconnu et
> délibérément hostile, ne peut interagir avec la machine et avec les données de
> l'app **que** par les messages de l'API, et rien d'autre.
>
> Complète `PLUGIN_FORMAT_V2.md` § 7-8.

---

## C.0 Le principe, en trois phrases

1. **Un seul canal.** Le code d'un plugin s'exécute dans un contexte qui n'a
   aucune primitive d'accès au disque, au réseau, à l'IPC, ni au DOM de l'app.
   Sa seule sortie est `postMessage` vers la fenêtre parente.
2. **Une liste blanche close.** L'hôte n'accepte de ce canal que les types de
   message d'une table fermée, chacun validé dans sa forme puis vérifié contre
   la permission consentie. Tout le reste est ignoré silencieusement.
3. **Aucune primitive de mutation.** Il n'existe pas de message qui crée ou
   modifie une tâche. Ce n'est pas une règle de politique qu'on pourrait
   contourner : le message n'existe pas dans le protocole, donc le chemin de
   code n'existe pas.

### Corollaire à ne jamais oublier

**Le SDK n'est pas une frontière de sécurité.** `plugins/sdk/*.js` vit *dans* la
frame du plugin. Un plugin hostile ne l'utilise pas : il appelle
`window.parent.postMessage({ ns: "trk.plugin", … })` directement. Les gardes du
SDK (`guarded()`, troncature des logs à 2 000 caractères) sont un confort de
développement.

> **Règle d'implémentation** : toute limite écrite dans le SDK doit être
> ré-appliquée côté hôte. Une limite qui n'existe que dans le SDK n'existe pas.

---

## C.1 Modèle de menace

| Profil | Ce qu'il essaie | Réaliste ? |
|---|---|---|
| **Buggé** | Boucle infinie, `doc:save` à chaque frame, document de 40 Mo, exception non interceptée. | Le cas courant. C'est celui qui casse l'app si rien ne borne. |
| **Curieux** | Lire les autres tâches que celles qu'on lui montre, deviner les chemins du disque, énumérer les autres plugins, lire le store. | Fréquent par inadvertance (« j'ai besoin de la description aussi »). |
| **Exfiltrant** | Sortir les données de l'utilisateur : `fetch`, image distante, formulaire, navigation, WebSocket, DNS. | Le vrai risque d'un écosystème communautaire. |
| **Malveillant** | Exécuter du code hors de la frame, atteindre Node, écrire un fichier, tuer un processus, escalader. | Faible probabilité, impact maximal. |
| **Compromis par mise à jour** | Le plugin v1.0 est honnête, la v1.4 ajoute une exfiltration. | Le scénario historique des extensions de navigateur. C'est pourquoi le consentement est **par version**. |
| **Trompeur** | Dessiner une fausse UI de l'app dans sa frame pour obtenir une action de l'utilisateur. | Non résoluble techniquement — traité en § C.7. |

---

## C.2 Les sept couches

Chaque couche est indépendante : la défaillance d'une seule ne suffit pas.

### Couche 1 — Le paquet (avant toute exécution)

| Verrou | Où |
|---|---|
| Manifeste validé : `format`, `id`, `engines.api ≤ PLUGIN_API_VERSION`, `engines.app` vs `package.json#version`. | `lib/plugins/manifest2.ts` |
| Chaque chemin déclaré (`entry`, `spec`, `icon`, `migrations`, `locales.dir`) doit exister **et** rester sous la racine du paquet, vérifié par `fs.realpath` (un lien symbolique ne sort pas). | `electron/plugins.js` |
| Aucun binaire, aucun `node_modules`, aucun script d'installation, aucune URL distante dans le paquet. | `trk-plugin validate` + contrôle à l'installation |
| Bornes : 200 fichiers, 10 Mo, `manifest.json` ≤ 64 Ko. | idem |
| Toute expression `trkx` analysée statiquement avant montage. | `lib/plugins/expr/analyze.ts` |

Une entrée invalide produit une erreur listée dans l'UI et **n'empêche pas** les
autres plugins de fonctionner — règle déjà en place en v1, conservée.

### Couche 2 — Le processus : pas de Node, pas d'IPC

C'est la couche décisive, et elle repose sur un fait vérifiable d'Electron.

```js
// main.js, createWindow()
webPreferences: {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}
```

`nodeIntegrationInSubFrames` n'est pas activé (défaut `false`). **Le script de
preload ne s'exécute donc pas dans les sous-frames.** Conséquence directe :
`window.storage`, `window.config`, `window.dataIO`, `window.images`,
`window.plugins`, `window.windowControls` — toute la surface exposée par
`contextBridge` — **n'existent pas** dans la frame d'un plugin. Il n'y a aucun
`ipcRenderer` à atteindre, aucun `require`, aucun `process`.

Le plugin ne peut pas non plus atteindre l'hôte pour lui emprunter cette
surface : l'hôte est sur une autre origine, donc `window.parent.storage` lève une
`SecurityError` avant même d'être résolu.

À ajouter (défense en profondeur, ~15 lignes) :

| Ajout | Effet |
|---|---|
| `session.defaultSession.setPermissionRequestHandler(() => false)` et `setPermissionCheckHandler(() => false)` | Refuse en bloc caméra, micro, géoloc, notifications, presse-papiers, MIDI, capteurs — pour toute la session, indépendamment de l'attribut `allow=""` de l'iframe. |
| `webContents.on("will-frame-navigate", …)` (Electron ≥ 28) | `will-navigate` ne couvre que la frame principale. Ce garde-là refuse toute navigation d'un **sous-cadre** vers autre chose que `app-plugin://<le même hôte>/`. Ferme la navigation de sa propre frame vers l'extérieur. |
| `session.webRequest.onBeforeRequest` : `cancel: true` pour tout schéma autre que `app-plugin:`, `app-image:`, `file:`, `devtools:` | Interrupteur général. Même si une CSP était mal formée un jour, aucune requête ne part de l'application. |
| Assertion de confinement dans le préambule du SDK | Si `window.storage`/`plugins`/`process`/`require` est présent dans la frame, le SDK **refuse de s'initialiser**, émet `plugin:manifest:error` et n'expose rien. Ne protège pas d'un plugin hostile (il n'utilise pas le SDK) : c'est un détecteur de régression de configuration de l'hôte, celle qui rendrait tout le reste sans objet. |

### Couche 3 — L'origine

Une origine par plugin : `app-plugin://<id>/`. Le serveur de protocole ne sert un
fichier que s'il appartient au paquet dont l'hôte est le nom.

```
app-plugin://mindmap/engine/layout.js   →  plugins/mindmap/engine/layout.js   ✔
app-plugin://mindmap/../charge/x.js     →  refusé (normalisation + realpath)  ✘
app-plugin://charge/…  depuis mindmap   →  refusé par la CSP (couche 4)       ✘
```

Le nom d'hôte étant l'`id` du manifeste, la grammaire `^[a-z0-9][a-z0-9-]{0,39}$`
n'est pas cosmétique : elle garantit un label DNS valide, donc pas d'ambiguïté
d'origine.

> **Point à trancher en phase 0, avec son critère de décision.**
> `sandbox="allow-scripts allow-same-origin"` rend le développement normal
> (`'self'`, modules ES sans CORS) mais donne au plugin `localStorage` /
> `IndexedDB` dans sa propre origine — un stockage cloisonné, hors du store de
> l'app, mais que l'hôte ne gouverne pas.
> **Critère : si les modules ES chargent depuis une origine opaque
> (`sandbox="allow-scripts"` seul, CSP `script-src app-plugin://<id>`,
> `Access-Control-Allow-Origin: *` sur les réponses du protocole), on garde
> l'origine opaque** — le plugin n'a alors *aucun* stockage, et la surface est
> strictement plus petite. Sinon, `allow-same-origin`, avec purge du partition
> de stockage à la désinstallation (`session.clearStorageData({ origin })`).
> Le format des paquets est identique dans les deux cas : seul le câblage change.

Dans les deux variantes, `allow-same-origin` ne permet **pas** de retirer son
propre sandbox : cette attaque n'existe que si le document encadré partage
l'origine de l'encadrant, ce qui n'est jamais le cas ici (`file:` vs
`app-plugin:`).

### Couche 4 — La CSP, dérivée des permissions

La CSP n'est pas une constante mais une **fonction du manifeste** : le manifeste
reste la seule surface d'autorisation, jusque dans les en-têtes.

```
default-src  'none'
script-src   'self'                    ← + 'wasm-unsafe-eval' seulement si permission `wasm`
style-src    'self' 'unsafe-inline'
img-src      'self' data: blob:
font-src     'self' data:
connect-src  'self'                    ← ses propres fichiers ; jamais le réseau
media-src    'none'                    ← 'self' data: blob: seulement si permission `media`
form-action  'none'
base-uri     'none'
frame-ancestors 'self'
```

Ce que chaque absence ferme, précisément :

| Absent | Donc impossible |
|---|---|
| `'unsafe-inline'` sur `script-src` | Injection inline, `onclick=`, `javascript:`. **C'était le point faible de la v1**, ouvert par la contrainte du mono-fichier. |
| `'unsafe-eval'` | `eval`, `new Function`, `setTimeout("…")`. Pas de chargement de code dynamique. |
| `'wasm-unsafe-eval'` | `WebAssembly.compile`. Un moteur WASM opaque n'entre pas sans permission explicite. |
| `frame-src` / `child-src` (retombe sur `default-src 'none'`) | Pas d'iframe imbriquée : un plugin ne peut pas encadrer un tiers ni un autre plugin. |
| `worker-src` (même repli) | Pas de `Worker`, `SharedWorker`, `ServiceWorker`. |
| `http:` / `https:` partout | Ni `fetch`, ni `XHR`, ni WebSocket, ni EventSource, ni `<img src="https://…">`, ni police distante, ni `@import` distant, ni balise `<a ping>`, ni beacon. **Toutes les voies d'exfiltration passives sont fermées par la même règle**, pas une par une. |
| `form-action 'none'` | Pas de POST vers l'extérieur. |
| `base-uri 'none'` | Pas de détournement de la résolution des URL relatives. |

Et côté hôte, inchangé : `frame-src 'self' app-plugin:` dans `vite.config.js`.
Cette directive gouverne aussi les **navigations ultérieures** de la frame, donc
`location = "https://…"` depuis le plugin est refusé — doublé par
`will-frame-navigate` (couche 2), parce que deux verrous indépendants valent
mieux qu'un comportement de moteur à vérifier.

### Couche 5 — L'attribut `sandbox`

Déjà en place (`PluginFrame.jsx`), conservé :

```jsx
<iframe sandbox="allow-scripts" allow="" referrerPolicy="no-referrer" />
```

Ce que l'absence de chaque jeton ferme : `allow-popups` → pas de `window.open` ;
`allow-top-navigation` → pas de navigation de l'app ; `allow-forms` → pas de
soumission ; `allow-modals` → `alert` / `confirm` / `prompt` neutralisés (donc
pas de blocage du thread de l'app, ni de fausse boîte de dialogue système) ;
`allow-downloads` → pas de téléchargement direct, ce qui **impose** de passer par
`file:save` et donc par le dialogue natif ; `allow-pointer-lock`,
`allow-presentation`, `allow-orientation-lock` → non accordés.

`allow=""` vide la Permissions Policy (caméra, micro, géoloc, plein écran natif,
paiement, USB, HID, série). `referrerPolicy="no-referrer"` évite de divulguer le
chemin du fichier hôte.

### Couche 6 — Le canal : validation en cinq gardes

Séquence exacte, à l'arrivée de chaque `message` (`usePluginHost.ts` →
`bridge.ts`) :

```
1. event.source === iframeRef.current.contentWindow
   → seule la frame réellement montée est écoutée. `event.origin` vaut "null"
     pour une frame sandboxée : inutilisable comme preuve, on ne s'en sert pas.
2. ns === "trk.plugin" et protocol === version négociée
   → écarte le bruit des autres frames et les messages d'une autre génération.
3. pluginId === l'id du plugin monté
   → un plugin ne peut pas se faire passer pour un autre.
4. type ∈ table close, ET forme validée champ par champ
   → `messageShapeOk` : un message qui prétend être `plugin:task:reveal` sans
     `id: string` non vide est rejeté ici, pas plus loin.
5. permissionFor(type) ∈ grants
   → `grants` = demandé ∩ consenti. PAS `manifest.permissions`.
```

Échec de n'importe laquelle : `null`, message ignoré, aucune exception. Le
compteur de rejets est visible dans la console de plugin — un plugin qui tente
en boucle une permission non accordée devient donc visible à l'utilisateur.

### Couche 7 — La forme de l'API

Le confinement final n'est pas un filtre, c'est **ce que l'API ne contient pas**.

| Ce que le plugin voit | Comment c'est borné |
|---|---|
| Les tâches | Une `TaskProjection`, construite par `lib/plugins/projection.ts`, qui est une **liste blanche de champs recopiés un par un**. Ajouter un champ à `Task` (une note privée, une pièce jointe) ne le fait pas fuir : il faut modifier la projection à la main. `description` en est absente, délibérément. |
| Son document | Le sien. La clé est `plugin-doc:<son id>:<docId>` ; l'`id` vient du manifeste validé, pas du message. Un plugin ne peut pas nommer la clé d'un autre. |
| Ses réglages, son état | Idem, préfixés par son `id`. |
| Une tâche à ouvrir | `task:reveal` = navigation. L'hôte appelle son propre `openEditTask`. Le plugin ne reçoit rien en retour, pas même une confirmation. |
| Un fichier à écrire | `file:save` → `dialog.showSaveDialog`, **l'utilisateur choisit le chemin**, l'hôte écrit les octets. Le plugin ne fournit jamais de chemin et n'apprend jamais celui retenu (le `filePath` du retour ne redescend pas dans la frame). |
| Écrire une tâche | **Aucun message.** Vérifiable : `PLUGIN_MESSAGE_TYPES` dans `bridge.ts` est une liste explicite, et aucune entrée ne mute une entité de l'app. |

---

## C.3 Tableau récapitulatif : vecteur → verrou

| Vecteur | Verrou | Couche |
|---|---|---|
| `fetch` / XHR / WebSocket / EventSource / beacon | `connect-src 'self'` + `onBeforeRequest` | 4, 2 |
| Image, police, feuille de style distante (exfiltration passive) | `img-src 'self' data: blob:`, `font-src`, `style-src 'self'` | 4 |
| Formulaire vers l'extérieur | `form-action 'none'` + sandbox sans `allow-forms` | 4, 5 |
| Navigation de sa frame vers le web | `frame-src` de l'hôte + `will-frame-navigate` | 4, 2 |
| Navigation de l'app entière | sandbox sans `allow-top-navigation` + `will-navigate` | 5, 2 |
| Nouvelle fenêtre | sandbox sans `allow-popups` + `setWindowOpenHandler → deny` | 5, 2 |
| Téléchargement direct | sandbox sans `allow-downloads` → passage obligé par `file:save` | 5, 7 |
| `eval`, `new Function`, code dynamique | `script-src` sans `'unsafe-eval'` | 4 |
| WebAssembly | pas de `'wasm-unsafe-eval'` sauf permission | 4 |
| `Worker` / `ServiceWorker` | repli sur `default-src 'none'` | 4 |
| Iframe imbriquée, encadrement d'un tiers | repli sur `default-src 'none'` | 4 |
| Lire le code ou les assets d'un autre plugin | origine par plugin + `'self'` | 3, 4 |
| Lire le store de l'app | pas de preload dans les sous-frames → pas de `window.storage` | 2 |
| Atteindre Node / `require` / `process` | `nodeIntegration: false`, `sandbox: true`, pas de preload en sous-frame | 2 |
| Atteindre le DOM de l'app | origine différente → `window.parent.document` lève | 3 |
| Traversée de répertoire | normalisation + `realpath` sous la racine du paquet | 1, 3 |
| Lien symbolique sortant du paquet | `realpath` | 1 |
| Usurper un autre plugin sur le canal | garde `pluginId` | 6 |
| Message forgé sans le SDK | validation intégrale côté hôte, le SDK n'est pas la frontière | 6 |
| Permission déclarée mais non consentie | `grants` = demandé ∩ consenti | 6 |
| Permission ajoutée par une mise à jour | consentement par version, plugin inactif jusqu'à accord | 1 |
| Caméra, micro, géoloc, presse-papiers, notifications | `allow=""` + `setPermissionRequestHandler → false` | 5, 2 |
| `alert`/`confirm` bloquant l'app | sandbox sans `allow-modals` | 5 |
| Inondation de messages, document géant | quotas § C.4 | 6 |
| ReDoS via une expression de vue | pas de regex dans `trkx` (§ Annexe A.13) | 1 |
| Boucle infinie dans une vue déclarative | langage total + budget de pas | 1 |
| Migration de document destructrice | budget + résultat validé, sinon document en lecture seule | 1 |

---

## C.4 Quotas

Appliqués **côté hôte**, dans `bridge.ts` et `usePluginHost.ts`. Dépassement :
message rejeté, compteur incrémenté, visible dans la console de plugin ; au-delà
d'un seuil, la frame est démontée avec un message clair à l'utilisateur.

| Limite | Valeur |
|---|---|
| Taille d'un message entrant | 256 Ko |
| Exception : `plugin:file:save` | 32 Mo (un export PNG est volumineux) |
| `plugin:doc:save` | 10/s ; enregistrement débouncé à 400 ms côté hôte (déjà en place) |
| Taille de `patch.data` sérialisé | 8 Mo |
| Nœuds / profondeur du document | 100 000 / 64 |
| `plugin:state:set` | 64 Ko et 100 clés par plugin |
| `plugin:toast` | 3/s |
| `plugin:log` | 20/s, 2 000 caractères par entrée, 500 entrées en anneau |
| `plugin:task:reveal` | 2/s |
| Handshake | `plugin:ready` sous 5 s, sinon état d'erreur rechargeable |
| Budget d'une migration | 2 s |

---

## C.5 Le tier déclaratif : confinement par construction

Une vue `kind: "declarative"` n'a ni frame, ni origine, ni canal. Elle ne peut
pas avoir de vulnérabilité de confinement, parce qu'il n'y a rien à confiner :
son unique pouvoir est de produire une valeur à partir d'un contexte en lecture
seule, dans un langage total, pur et sans `eval`.

C'est pourquoi ce tier est prioritaire dans le plan d'exécution (phase 3, avant
le tier `app`) : chaque plugin communautaire écrit en déclaratif est un plugin
qui **ne franchit jamais** la frontière de sécurité.

---

## C.6 Vérifier, pas supposer

| Invariant | Comment il est tenu |
|---|---|
| Aucun message de mutation dans le protocole | Test qui compare `PLUGIN_MESSAGE_TYPES` à une liste attendue, et échoue si un type est ajouté sans mise à jour explicite. Force la revue. |
| `projectTask` ne recopie que la liste blanche | Test qui construit une `Task` avec un champ inattendu et vérifie qu'il est absent de la projection. |
| Une permission non consentie n'ouvre rien | Test par permission : `decodePluginMessage` rend `null` pour chaque type dont la permission manque (le motif existe déjà dans `bridge.test.ts`). |
| Pas de traversée de répertoire | Tests sur dossier temporaire : `..`, chemin absolu, lien symbolique sortant, hôte inconnu. |
| Aucun pont de l'hôte dans la frame | Assertion du SDK au démarrage + test manuel documenté dans la recette. |
| La CSP servie correspond aux permissions | Test de `cspFor(manifest)` : sans permission `wasm`, pas de `'wasm-unsafe-eval'` ; jamais de source `http`/`https` quelle que soit l'entrée. |
| Une expression fausse ne monte pas | Test : un `.trkv` avec un identifiant hors portée produit une erreur et la vue n'est pas rendue. |
| Les quotas sont côté hôte | Test qui envoie un message forgé **sans passer par le SDK** et vérifie le rejet. |

Checklist de revue, à appliquer à toute PR touchant `plugins/` :

- [ ] Un type de message ajouté a-t-il une permission dans `permissionFor` ?
- [ ] Un champ ajouté à `TaskProjection` est-il volontairement partagé ?
- [ ] Une nouvelle donnée dans `host:init` est-elle gardée par une permission ?
- [ ] Une nouvelle directive CSP est-elle dérivée du manifeste ?
- [ ] Une limite ajoutée est-elle appliquée côté **hôte** et pas seulement dans le SDK ?

---

## C.7 Ce qui n'est pas protégé — et pourquoi le dire

Un modèle de sécurité qui prétend tout couvrir n'est pas crédible.

| Non couvert | Réalité | Atténuation |
|---|---|---|
| **Consommation CPU / mémoire dans sa propre frame** | Un plugin peut faire ramer son onglet. On ne peut pas tuer une frame proprement, et l'environnement de ce dépôt interdit toute terminaison de processus. | Le rendu de l'app reste dans un autre document ; le démontage de l'iframe (retrait d'un nœud du DOM de l'hôte) est disponible depuis l'UI. |
| **UI trompeuse (hameçonnage)** | Un plugin peut dessiner une fausse boîte de dialogue de l'app à l'intérieur de sa frame. Aucune barrière technique n'existe contre ça, dans aucun système d'extension. | La frame porte en permanence un bandeau non simulable — nom du plugin et `publisher` — posé par l'hôte hors de la frame. Le mode `fullscreen` garde une sortie visible côté hôte (touche Échap + bouton), et l'hôte diffuse `host:fullscreen` pour que rien ne se désynchronise. |
| **Le contenu du document** | L'hôte traite `data` comme opaque : il ne peut pas juger si un plugin y écrit des bêtises. | `dataVersion` + migrations validées + `data:export` de l'app permettent de revenir en arrière. |
| **Code arbitraire dans la frame** | C'est le contrat : un plugin `app` exécute du JS. Le confinement ne rend pas le code inoffensif, il rend son environnement stérile. | Toutes les couches ci-dessus. Et le tier déclaratif, pour ne pas avoir à faire ce pari quand ce n'est pas nécessaire. |
| **Chaîne d'approvisionnement** | Un `.trkx` téléchargé reste du code d'un tiers. `sha256` vérifie l'intégrité du transport, pas les intentions de l'auteur. | Consentement par version, permissions en français clair, `publisher` affiché, registre par PR (donc revue humaine et historique Git). Signature du paquet : prévue comme champ facultatif de l'index, non implémentée. |

---

## C.8 Réponse directe à la question posée

> *Comment limiter les interactions avec le système à la seule API offerte ?*

Non pas en filtrant ce qu'un plugin tente de faire, mais en le plaçant dans un
contexte **où les primitives n'existent pas** :

- pas de preload dans les sous-frames → **aucun objet IPC à appeler** ;
- `nodeIntegration: false`, `sandbox: true` → **aucun Node à atteindre** ;
- CSP `default-src 'none'` avec `connect-src 'self'` → **aucune socket à ouvrir** ;
- origine distincte de l'hôte → **aucun DOM d'application à lire** ;
- attribut `sandbox` sans jetons → **aucune fenêtre, aucun formulaire, aucun
  téléchargement, aucune navigation** ;
- une seule fonction de sortie, `postMessage`, dont l'hôte n'accepte qu'une table
  close de messages, validés dans leur forme puis autorisés par une permission
  consentie ;
- et dans cette table, **aucun message qui écrit dans les données de l'app.**

L'API offerte n'est donc pas la voie recommandée : c'est la seule voie qui
existe.
