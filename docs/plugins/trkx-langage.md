# Annexe A — `trkx`, le langage d'expression

> Spécification normative du mini-langage utilisé par les champs `where`,
> `sort`, `value`, `group` d'une vue déclarative (`trk.view/1`), par les `when`
> des commandes et par les colonnes contribuées.
>
> Complète `PLUGIN_FORMAT_V2.md` § 6.

---

## A.1 Pourquoi un langage plutôt qu'une fonction JS

Un champ `value` pourrait être une fonction JS. Ce serait plus simple à écrire
et strictement pire :

| Avec du JS | Avec `trkx` |
|---|---|
| Il faut une iframe, une origine, une CSP, un pont `postMessage`. | Évalué dans l'hôte, dans le rendu React, sans frame ni protocole. |
| Aucune analyse possible avant exécution. | `trk-plugin validate` rejette une expression fausse **avant** publication. |
| Peut boucler, lever, muter, lire les globales. | Total, pur, sans exception, portée close. |
| Un plugin de vue coûte des centaines de lignes. | Un plugin de vue coûte 20 lignes. |

Le langage n'existe donc pas pour remplacer JS partout : il existe pour que la
classe la plus fréquente de plugins (« montre-moi mes tâches autrement ») **ne
franchisse jamais la frontière de sécurité**. Le tier `app` reste là pour le
reste.

---

## A.2 Les cinq invariants

Ils sont non négociables : chacun est ce qui permet d'évaluer l'expression d'un
inconnu dans le processus de rendu de l'app.

1. **Total** — toute évaluation termine. Aucune boucle, aucune récursion, aucune
   fonction définissable par l'utilisateur. L'itération n'existe que bornée par
   la longueur d'une liste déjà en mémoire, et sous budget (§ A.9).
2. **Pur** — aucun effet de bord. Une expression ne peut rien écrire, rien
   émettre, rien déclencher. Le résultat est une valeur, point.
3. **Sans `eval`** — ni `eval`, ni `new Function`, ni `with`. L'AST est
   interprété par un `switch`. Aucune portion de la chaîne source n'atteint
   jamais un compilateur JS.
4. **Sans exception** — une expression fausse rend `null`, jamais un throw.
   Un plugin ne peut pas casser le rendu de l'hôte par une expression tordue.
5. **Déterministe** — `now` et `lang` sont **injectés** dans le contexte par
   l'hôte, jamais lus depuis `Date.now()` ou une globale. Deux évaluations du
   même AST avec le même contexte rendent la même valeur : testable, mémoïsable.

---

## A.3 Lexique

| Classe | Forme |
|---|---|
| Nombre | `0` `42` `3.14` `-7` (le `-` est un opérateur unaire, pas une partie du littéral) |
| Chaîne | `'texte'` ou `"texte"`. Échappements : `\\` `\'` `\"` `\n` `\t`. **Aucune interpolation.** |
| Littéral | `true` `false` `null` |
| Identifiant | `[A-Za-z_][A-Za-z0-9_]*` |
| Mot-clé | `and` `or` `not` `in` — réservés, ne peuvent pas être des identifiants |
| Opérateur | `== != < <= > >= + - * / % \| ( ) [ ] , .` |
| Blanc | espace, tabulation, retour ligne — non significatifs |
| Commentaire | `#` jusqu'à la fin de la ligne |

Le lexeur conserve pour chaque jeton son `offset` et sa `length` : les
diagnostics de `validate` pointent une colonne exacte, ce qui rend l'outillage
d'éditeur utile.

---

## A.4 Grammaire

```
expr      := orExpr
orExpr    := andExpr ( "or" andExpr )*
andExpr   := notExpr ( "and" notExpr )*
notExpr   := "not" notExpr | cmpExpr
cmpExpr   := addExpr ( cmpOp addExpr )?           # non associatif
cmpOp     := "==" | "!=" | "<" | "<=" | ">" | ">=" | "in"
addExpr   := mulExpr ( ("+" | "-") mulExpr )*
mulExpr   := pipeExpr ( ("*" | "/" | "%") pipeExpr )*
pipeExpr  := unary ( "|" filterCall )*
unary     := "-" unary | postfix
postfix   := primary ( "." ident | "[" expr "]" )*
primary   := number | string | "true" | "false" | "null"
           | funcCall | ident | "(" expr ")" | listLit
funcCall  := ident "(" ( expr ( "," expr )* )? ")"
filterCall:= ident ( "(" ( expr ( "," expr )* )? ")" )?
listLit   := "[" ( expr ( "," expr )* )? "]"
```

Précédence, du plus lâche au plus serré :

```
or  <  and  <  not  <  comparaison  <  + -  <  * / %  <  |  <  - unaire  <  . [ ]
```

Conséquences à connaître :

- `sum(items.minutes) | duration == "3 h"` se lit `(sum(…) | duration) == "3 h"`.
  Le tube est plus serré que la comparaison : c'est le sens attendu dans un
  champ `value`, et cela évite de parenthéser en permanence.
- `not archived and done` se lit `(not archived) and done`.
- La comparaison est **non associative** : `a < b < c` est une erreur d'analyse,
  pas un piège silencieux.

L'analyseur est descendant récursif, une fonction par niveau de précédence.
Aucun générateur, aucune dépendance.

---

## A.5 Modèle de types

Six types, fermés : `null`, `bool`, `number`, `string`, `list`, `record`.

Pas de type date : une date est une `string` ISO (`"2026-08-10"`), comme dans
`lib/types.ts`. Les fonctions `date`, `days`, `overdue`, `age` la lisent.

### Véracité

Faux : `null`, `false`, `0`, `NaN`, `""`, `[]`, `{}`. Tout le reste est vrai.

Le cas `[]` faux est délibéré : `where: refs` signifie « a au moins une
référence », ce qui est la lecture naturelle.

### Comparaison

| Cas | Règle |
|---|---|
| `number` vs `number` | numérique |
| `string` vs `string` | lexicographique par point de code (pas de collation locale : le tri doit être stable entre machines) |
| `bool` vs `bool` | `false < true` |
| `null` vs quoi que ce soit | `==` / `!=` seulement ; `<` `>` `<=` `>=` rendent `null` |
| types différents | `==` rend `false`, l'ordre rend `null` |
| `list` / `record` | `==` compare par structure, en profondeur, sous budget |

`x in y` : appartenance à une `list` (structurelle), ou sous-chaîne si `y` est
une `string`, ou présence de clé si `y` est un `record`. Sinon `false`.

### Arithmétique

`+ - * / %` sont **numériques uniquement**. Un opérande non numérique rend
`null` (pas de concaténation implicite, pas de `"1" + 1`). Division ou modulo
par zéro : `null`. La concaténation se fait par `join`.

---

## A.6 Résolution de chemin

`a.b[0].c` lit des propriétés **propres** uniquement, via `Object.hasOwn`.

Refusé à l'**analyse** (donc `validate` échoue, le plugin ne se publie pas) :
`__proto__`, `constructor`, `prototype`, `__defineGetter__`,
`__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`.

Refusé à l'**exécution** : toute valeur qui n'est pas un des six types (une
fonction, un `Symbol`, un nœud DOM) est lue comme `null`. Le contexte
d'évaluation est de toute façon construit par l'hôte à partir de projections
sérialisables — mais la garde reste, parce qu'elle coûte trois lignes et couvre
une évolution future du contexte.

Un segment absent rend `null` et **arrête** la descente : `a.b.c` sur `a = null`
rend `null` sans erreur. C'est l'équivalent d'un `?.` implicite partout.

---

## A.7 Portées

La portée n'est pas globale : chaque champ déclare ce qu'il voit. Un identifiant
hors portée est une **erreur d'analyse**, pas un `undefined` à l'exécution.

| Champ | Identifiants liés |
|---|---|
| `where`, `sort`, `group` (source `tasks`) | les champs de `TaskProjection` à plat (`titre`, `projet`, `statut`, `weight`, `minutes`, `archived`, `done`, `echeance`, …), plus `now`, `lang`, `settings`, `doc` |
| `layout.columns[].value`, en mode plat | idem, plus `task` (l'objet complet) |
| `layout.columns[].value`, en mode groupé | `group` (la valeur de regroupement), `items` (la liste des projections du groupe), plus `now`, `lang`, `settings` |
| prédicat d'un `filter` / clé d'un `sort` | `it` (l'élément courant), plus la portée englobante |
| `when` d'une commande | `view` (`{ id, scope, project }`), `doc`, `selection`, `settings`, `now` |
| `value` d'une colonne contribuée | `task`, plus `now`, `lang`, `settings` |

`settings` = les réglages du plugin lui-même (`contributes.settings`), jamais
ceux de l'app ni d'un autre plugin. `doc` = le document du plugin, jamais celui
d'un autre.

**Rien d'autre n'est atteignable.** Pas de `window`, pas de `globalThis`, pas de
`tasks` brutes — seulement des projections construites par
`lib/plugins/projection.ts`, qui est une liste blanche de champs (§ Annexe C).

---

## A.8 Fonctions et filtres

Une seule table, close. `x | f(a)` est **exactement** `f(x, a)` : le tube n'est
qu'une écriture, pas un mécanisme.

`L` = argument **paresseux** (reçu comme AST, évalué une fois par élément avec
`it` lié). Tous les autres sont évalués avant l'appel.

| Nom | Signature | Notes |
|---|---|---|
| `count` | `count(list)` | `0` sur `null` |
| `sum` `avg` `min` `max` | `f(list, path?)` | `path` = chemin à extraire de chaque élément ; ignore les non-nombres ; `avg` d'une liste vide → `null` |
| `first` `last` | `f(list)` | `null` si vide |
| `take` | `take(list, n)` | |
| `filter` | `filter(list, L)` | `it` lié à l'élément |
| `sort` | `sort(list, L?)` | tri stable ; clé absente → tri sur l'élément |
| `reverse` | `reverse(list)` | |
| `unique` | `unique(list, L?)` | |
| `groupBy` | `groupBy(list, L)` | rend une `list` de `{ key, items }` — un `record` de clés arbitraires serait un vecteur de pollution |
| `pluck` | `pluck(list, path)` | |
| `flatten` | `flatten(list)` | un seul niveau |
| `join` | `join(list, sep?)` | `sep` par défaut `", "` |
| `upper` `lower` `trim` | `f(string)` | |
| `truncate` | `truncate(string, n, suffix?)` | |
| `contains` `startsWith` `endsWith` | `f(string, sub)` | **remplace toute idée de regex** (§ A.13) |
| `replace` | `replace(string, from, to)` | littéral, toutes occurrences |
| `round` | `round(number, digits?)` | |
| `percent` | `percent(part, total?)` | `total` par défaut `100` |
| `abs` `clamp` | `abs(n)`, `clamp(n, lo, hi)` | |
| `duration` | `duration(minutes)` | `200` → `"3 h 20"`, localisé par `lang` |
| `date` | `date(iso, style?)` | `style` ∈ `short \| long \| iso \| relative`, via `Intl` et `lang` |
| `days` | `days(iso, from?)` | écart en jours entiers, `from` par défaut `now` |
| `overdue` | `overdue(iso)` | `bool`, faux si `null` |
| `age` | `age(iso)` | jours depuis `iso` |
| `default` | `default(v, fallback)` | remplace si faux au sens § A.5 |
| `coalesce` | `coalesce(a, b, …)` | premier non-`null` |
| `if` | `if(cond, a, b)` | args `a`/`b` paresseux |
| `statusLabel` `statusColor` | `f(id)` | **résolus par l'hôte** via `lib/statuses.ts` |
| `prioLabel` `prioColor` | `f(id)` | idem |
| `t` | `t(key, fallback?)` | locales du plugin puis clés `plugin_*` de l'hôte |

Les quatre dernières familles sont le point important : un plugin n'a **jamais**
à recopier le référentiel de statuts. Il affiche l'état réel de l'app et suit
automatiquement une évolution de `STATUSES`.

Ajouter une fonction est une modification de l'hôte, donc une montée de
`engines.api` si un plugin en dépend. La table close est ce qui garde le langage
analysable.

---

## A.9 Budget d'évaluation

Un compteur de pas est décrémenté à chaque nœud d'AST évalué. Il rend le langage
total y compris en présence de `filter` imbriqués sur de longues listes.

| Limite | Valeur | Motif |
|---|---|---|
| Pas d'évaluation | 50 000 par expression | Une expression légitime en consomme < 500. Épuisement → `null` + diagnostic d'exécution. |
| Longueur de liste traversée | 20 000 | Au-delà, la liste est tronquée et un avertissement est remonté. |
| Profondeur d'AST | 64 | Refusé à l'analyse. |
| Longueur de source | 4 096 caractères | Refusé à l'analyse. Une expression plus longue est le signe qu'il fallait le tier `app`. |
| Profondeur de comparaison structurelle | 16 | |

---

## A.10 Erreurs

Deux régimes, volontairement asymétriques.

**À l'analyse** (`trk-plugin validate`, et au chargement du plugin) — tout est
fatal, avec position :

```
charge.trkv:6:12  E_UNKNOWN_IDENT     `statuts` inconnu dans cette portée (proche : `statut`)
charge.trkv:9:22  E_UNKNOWN_FN        fonction `somme` inconnue (proche : `sum`)
charge.trkv:9:26  E_ARITY             `round` attend 1 ou 2 arguments, 3 fournis
charge.trkv:11:5  E_FORBIDDEN_PROP    propriété `constructor` interdite
charge.trkv:14:9  E_CHAINED_CMP       comparaison chaînée ; parenthéser
charge.trkv:3:1   E_TYPE              `+` attend des nombres, chaîne littérale à droite
```

Une vue dont une expression ne s'analyse pas **n'est pas montée** : le plugin
apparaît en erreur dans l'UI, avec le diagnostic, et les autres plugins ne sont
pas affectés. Même politique qu'un manifeste invalide en v1.

**À l'exécution** — rien n'est fatal. Le résultat est `null`, et l'évaluateur
accumule des avertissements consultables dans la console de plugin (budget
épuisé, liste tronquée, division par zéro). Un plugin publié ne peut donc pas
faire tomber une vue par une donnée inattendue.

---

## A.11 Implémentation

```
src/lib/plugins/expr/
  lex.ts        ~110 l.  jetons + positions
  parse.ts      ~200 l.  descendant récursif, une fonction par niveau
  analyze.ts    ~120 l.  portées, arités, propriétés interdites, types littéraux
  eval.ts       ~150 l.  switch sur l'AST, budget, chemins sûrs
  fns.ts        ~230 l.  la table close
  index.ts      ~40  l.  API publique + cache
  *.test.ts              un fichier par module
```

API publique :

```ts
export type Value = null | boolean | number | string | Value[] | { [k: string]: Value };

export interface Diagnostic {
  code: string;            // E_UNKNOWN_IDENT, …
  message: string;         // français, destiné au développeur de plugin
  offset: number;
  length: number;
}

export type ParseResult =
  | { ok: true; ast: Node }
  | { ok: false; errors: Diagnostic[] };

export function parse(source: string): ParseResult;
export function analyze(ast: Node, scope: ScopeShape): Diagnostic[];
export function evaluate(ast: Node, ctx: EvalContext): { value: Value; warnings: string[] };

/** Analyse + valide en une fois, avec cache par (source, portée). */
export function compile(source: string, scope: ScopeShape): Compiled | { errors: Diagnostic[] };
```

`compile` mémoïse par `source + nom de portée` dans une `Map` bornée (LRU, 500
entrées). Indispensable : une colonne de tableau est évaluée une fois par ligne,
à chaque rendu ; ré-analyser la même chaîne 200 fois serait absurde.

Contraintes du dépôt à respecter : `strict` + **`noUncheckedIndexedAccess`**
(tout `tokens[i]` est `Token | undefined`, il faut garder), `import type` pour
les types (`isolatedModules`), pas de `any`, un `*.test.ts` par module.

Volume réel : **~850 lignes avec les tests**, dont ~200 pour l'analyseur seul.
L'estimation « ~200 lignes » donnée dans le résumé initial ne couvrait que
l'analyseur, pas la table de fonctions ni l'analyse statique.

---

## A.12 Exemples

Contexte : une `TaskProjection` avec `statut: "en-cours"`, `minutes: 200`,
`echeance: "2026-07-01"`, `assigne: ""`, `now = "2026-08-10"`.

| Expression | Résultat |
|---|---|
| `titre` | `"Refonte du portail"` |
| `minutes \| duration` | `"3 h 20"` |
| `assigne \| default(t('unassigned', 'Non assigné'))` | `"Non assigné"` |
| `overdue(echeance) and not done` | `true` |
| `days(echeance)` | `-40` |
| `statut \| statusLabel` | `"En cours"` |
| `weight >= 50 and priorite in ['P0', 'P1']` | `false` |
| `round(minutes / 60, 1)` | `1.7` |
| `sum(items, 'minutes') \| duration` | `"41 h 05"` |
| `count(filter(items, it.done))` | `7` |
| `groupBy(items, it.assigne) \| count` | `4` |
| `if(overdue(echeance), t('late'), '')` | `"En retard"` |
| `titre \| truncate(20)` | `"Refonte du portail"` |
| `bidule.machin` | `null` (erreur d'analyse : `bidule` hors portée) |

---

## A.13 Non-objectifs, et un retrait assumé

Ne sera pas ajouté :

- Affectation, déclaration de variable, fonction définie par l'utilisateur.
- Lambda générale. Seule la liaison implicite `it` existe, dans les arguments
  paresseux de `filter` / `sort` / `unique` / `groupBy`.
- Concaténation par `+`, interpolation de chaîne. → `join`.
- Import, inclusion, référence à un autre fichier.
- Accès à l'heure système, au hasard, à l'environnement. → `now` est injecté.
- **Expression régulière.** L'esquisse initiale prévoyait un opérateur
  `matches`. Il est retiré : une regex fournie par un tiers est un vecteur de
  déni de service par retour arrière catastrophique (ReDoS) évalué **dans le
  processus de rendu de l'app**. Le trio `contains` / `startsWith` / `endsWith`
  couvre les besoins réels d'un champ de vue, en temps linéaire garanti. Si un
  besoin de motif apparaît, ce sera un glob borné (`*`, `?`), jamais une regex.
