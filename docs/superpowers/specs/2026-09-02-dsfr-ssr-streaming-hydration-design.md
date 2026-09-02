# Support du streaming Server Components sans renoncer au rendu serveur

Design — 2026-09-02
Discussion d'origine : https://github.com/codegouvfr/react-dsfr/discussions/398

## Problème

`react-dsfr` traite aujourd'hui l'incompatibilité entre le moteur JS de `@gouvfr/dsfr` et
l'hydratation React en **différant le démarrage du moteur**. `DsfrProvider` met
`window.dsfr.start()` dans une file d'attente, et `<StartDsfrOnHydration />` la vide dans son
`useEffect`. La documentation impose de monter ce composant sur chaque page.

Ce dispositif ne corrige pas le streaming, il le contourne. Le moteur démarre au premier effet du
shell ; tout contenu arrivé plus tard par un boundary `<Suspense>` est inséré dans le DOM en HTML
brut, muté par le `MutationObserver` du moteur, puis hydraté par React. La seule façon d'être à
l'abri est de ne plus streamer — c'est-à-dire de renoncer au bénéfice des Server Components.

Ce document propose de supprimer la cause plutôt que de décaler le symptôme : **en mode React, le
moteur DSFR ne doit produire aucune mutation DOM au moment de l'instanciation.**

## Périmètre

- **Setups couverts** : Next.js App Router uniquement (`src/next-app-router/`). Les autres entrées
  (`next-pagesdir.tsx`, SPA Vite/CRA) ne sont pas modifiées.
- **Cible de livraison** : PR sur `codegouvfr/react-dsfr`, donc contrainte de rétrocompatibilité
  stricte. Puis, dans un second temps, PR sur `GouvernementFR/dsfr` pour intégrer le comportement
  nativement au moteur.
- **Hors périmètre** : le markup DSFR écrit à la main par les applications (le design ne lui
  demande rien et ne le dégrade pas), et la cause propre à Next.js suspectée dans l'issue #464.

## Contrat proposé

> En `mode: "react"`, le moteur DSFR ne produit aucune mutation DOM au moment de l'instanciation.
> Les mutations déclenchées par une interaction utilisateur restent inchangées : elles surviennent
> par définition après hydratation.

Ce contrat n'est pas nouveau, il est déjà amorcé dans le moteur. `HeaderLinks.init()`
(`dsfr.module.js` l.6428) recopie `header__tools-links` dans `header__menu-links` via `innerHTML`
en mode `auto`, mais se contente d'un `warn()` en modes `react`, `vue` et `angular`. Le design
étend cette ligne au reste du moteur.

La formulation « idempotent » serait fausse : le moteur *doit* pouvoir muter après hydratation. Le
critère est de ne pas muter **pendant la fenêtre d'instanciation**, qui s'ouvre à l'insertion du
nœud dans le DOM et se ferme à l'hydratation du boundary qui le contient.

## Audit : les mutations réellement produites à l'instanciation

Audit exhaustif des 46 registrations de `@gouvfr/dsfr@1.14.2`, par examen des méthodes `init()`,
`render()`, `resize()`, `examine()`, `prepare()`, `populate()` et `project()`.

| # | Mutation | Portée | Traitement |
|---|---|---|---|
| 1 | `Instance._config` → `setAttribute('data-fr-js-<x>', true)` (l.1592) | Les 46, universelle | Cœur du patch (§2.1) |
| 2 | `render()`/`resize()` → `style.setProperty('--tabs-height', …)` etc. | 6 : `EquisizedsGroup`, `Tooltip`, `TabsGroup`, `TabsList`, `TableRow`, `Segmented` | Décalage rAF (§2.2) |
| 3 | `Segmented.resize` → `classList.add/remove('fr-segmented--vertical')` | 1 | Décalage rAF (§2.2) |
| 4 | `Scheme.init` → `removeAttribute('data-fr-transition')`, scheme/theme | `<html>` uniquement | Déjà couvert par le `suppressHydrationWarning` de `getHtmlAttributes` |
| 5 | `HeaderLinks.init` → `menuLinks.innerHTML = …` | 1, structurelle | Déjà neutralisé par `Modes.REACT` |
| 6 | `retrieveNodeId` → `setAttribute('id', …)` (l.1869) | Rare | Ne s'exécute que si le nœud n'a pas d'`id` ; `react-dsfr` en fournit un. À vérifier, pas à corriger a priori. |
| 7 | `Display.init` → `setAttribute('disabled')` sur le fieldset | 1 | Branche morte : conditionnée à `!api.scheme`, jamais vrai dans `react-dsfr` |

**Conclusion de l'audit** : en mode React, il ne reste **aucune mutation structurelle**. Tout ce qui
subsiste est attributaire — `data-fr-js-*`, `style`, `class`. Le correctif porte donc sur un point
de passage unique (`Instance._config`) plus une poignée de cas nommés, et non sur 46 classes.

Cette conclusion appelle une réserve explicite, traitée en §4.2 : React n'interrompt pas
l'hydratation sur une divergence d'attribut, il émet un avertissement en développement et conserve
la valeur du DOM. Il est donc possible que ce que ce design élimine soit du bruit de console et non
une casse en production. Cette question est tranchée par la mesure, avant tout patch.

## Contrainte structurelle : pourquoi le marquage post-hydratation est écarté

Sur 42 composants racine de `src/`, **7 seulement sont des client components**. `Card`, `Tile`,
`Button`, `Modal`, `Table`, `Header`, `Footer`, `Breadcrumb`, `Tag`, `Tooltip`, `ToggleSwitch`,
`SideMenu` sont des Server Components.

La solution intuitive — chaque composant se marque « prêt » dans un `useEffect` après hydratation,
et le moteur n'instrumente que les nœuds marqués — obligerait à convertir une trentaine de
composants en client components. Ce serait précisément l'opt-out des Server Components que ce
design cherche à éviter.

Cette contrainte est structurelle, pas contingente : **React n'expose aucun signal « ce sous-arbre
est hydraté » sans un client component situé à l'intérieur du boundary.** Toute solution fondée sur
un marquage post-hydratation exige donc soit la conversion des composants, soit un marqueur à la
charge de l'utilisateur (`<DsfrHydrated />` dans chaque `<Suspense>`) — qui ne fait que déplacer le
reproche adressé à `StartDsfrOnHydration`.

Le design retenu contourne entièrement ce problème : en supprimant les mutations, il n'a plus
besoin de savoir quand l'hydratation est terminée.

## §2 — Patch `@gouvfr/dsfr`

Trois modifications dans `patches/@gouvfr+dsfr+1.14.2.patch`, qui existe déjà. Le patch est bien
embarqué dans le paquet publié : `scripts/build/build.ts:33` copie
`node_modules/@gouvfr/dsfr/dist` vers `dsfr/`, et `dsfr/` figure dans `files` du `package.json`.

Les trois modifications sont **indépendantes et justifiables séparément**, de sorte qu'une PR amont
qui n'en retiendrait que deux reste cohérente.

### §2.1 — Ne plus poser les `data-fr-js-*` inutiles

Dans `Instance._config` (l.1592) :

```diff
-    if (this.jsAttribute) this.setAttribute(registration.attribute, true);
+    if (this.jsAttribute && (api.mode !== api.Modes.REACT || CSS_BOUND_JS_ATTRIBUTES.has(registration.attribute))) {
+      this.setAttribute(registration.attribute, true);
+    }
```

avec `CSS_BOUND_JS_ATTRIBUTES = new Set(['data-fr-js-range', 'data-fr-js-table'])`.

Justification du contenu de cet ensemble : sur les 46 attributs `data-fr-js-*`, **deux seulement
sont référencés par le CSS DSFR** — `[data-fr-js-range]` (50 occurrences, présence seule) et
`[data-fr-js-table=true]` (12 occurrences, valeur exacte). Les 44 autres ne portent aucun style et
peuvent disparaître sans effet visuel.

Le `removeAttribute` symétrique de `_dispose` (l.1880) devient un no-op pour ces 44 attributs, sans
effet de bord.

**Exception à préserver impérativement** : `data-fr-js="true"` posé par `Root` sur `<html>` (l.744)
doit rester. `useIsDark/client.ts:52` le lit pour déterminer si le moteur a démarré. Il est déjà
couvert par le `suppressHydrationWarning` de `getHtmlAttributes`.

**Vérification d'implémentation** : s'assurer qu'aucun code interne du moteur ne relit
`registration.attribute` depuis le DOM (voir `Element.examine`, `Instance.mutate`).

### §2.2 — Différer `init()` d'une frame en mode React

Dans `Instance._config` (l.1593) :

```diff
-    this.init();
+    if (api.mode === api.Modes.REACT) window.requestAnimationFrame(() => { if (!this.isDisposed) this.init(); });
+    else this.init();
```

Cette modification traite les mutations #2 et #3 d'un seul geste, sans toucher aux six classes
concernées. `init()` est ce qui met `isRendering` / `isResizing` à `true`, donc ce qui enrôle
l'instance dans le `Renderer` et le `Resizer` — les seuls producteurs des `style.setProperty()` et
du `classList` du `Segmented`. Décaler `init()` décale toute la chaîne.

**Contrepartie assumée** : les écouteurs d'événements sont attachés une frame plus tard (~16 ms
après l'insertion du nœud). Un clic survenant dans cette fenêtre serait perdu. C'est le point le
plus discutable du design ; il est documenté comme tel dans la PR et couvert par l'assertion
fonctionnelle de l'e2e (§4.4).

### §2.3 — Aucune autre modification

`HeaderLinks` (#5) et `Display` (#7) sont déjà couverts par le moteur. `Scheme` (#4) porte sur
`<html>`, déjà traité côté `react-dsfr`.

## §3 — Modifications `react-dsfr`

### §3.1 — Couvrir les deux attributs conservés

Les deux attributs de `CSS_BOUND_JS_ATTRIBUTES` continuent d'être posés par le moteur après
insertion, et constituent donc une divergence d'hydratation. Ils portent l'un et l'autre sur **la
racine même du composant** : `.fr-table` (`Table.tsx:72`) et `.fr-range` (`Range.tsx:143`). La
portée d'un seul niveau de `suppressHydrationWarning` est donc exactement suffisante.

- `Table.tsx` : `suppressHydrationWarning` sur `<div className="fr-table">`
- `Range.tsx` : `suppressHydrationWarning` sur `<div className="fr-range">`

`Table.tsx` **reste un Server Component** : il s'agit d'un attribut statique, pas d'un effet.

**Alternative écartée** : rendre `data-fr-js-table="true"` et `data-fr-js-range` directement dans le
HTML SSR. Ces attributs gouvernent des styles qui dépendent de variables CSS calculées par le JS
(`--row-height`, la piste du range). Les rendre en SSR appliquerait le rendu « JS actif » avant que
ces variables existent — FOUC, et rendu durablement faux si le JS échoue.

### §3.2 — `StartDsfrOnHydration` cesse d'être obligatoire

C'est le gain de DX principal, et la réponse directe à l'objection d'origine.

Aujourd'hui `dsfrEffect()` n'est appelé que par `StartDsfrOnHydration`, que la documentation impose
de monter sur chaque page. Or `DsfrProvider` est déjà un client component qui enveloppe toute
l'application, et **React exécute les effets des enfants avant ceux du parent** : un `useEffect`
dans `DsfrProvider` s'exécute donc une fois le shell hydraté — la garantie recherchée, sans rien
demander à l'utilisateur.

Le `useEffect` correspondant est déjà écrit dans `src/next-app-router/DsfrProvider.tsx`, en
commentaire aux lignes 62-66. Il suffit de le décommenter :

```diff
-    /*
-    useEffect(() => {
-        dsfrEffect();
-    }, []);
-    */
+    useEffect(() => {
+        dsfrEffect();
+    }, []);
```

`StartDsfrOnHydration` reste exporté et pleinement fonctionnel : `dsfrEffect()` est déjà idempotent,
gardé par `isAfterFirstEffect`. Les applications qui le montent déjà ne cassent pas. Il est annoté
`@deprecated` avec un message pointant vers `DsfrProvider`.

**Aucun breaking change**, ce qui est la contrainte n°1 pour une PR acceptée en amont.

### §3.3 — Ce qui ne change pas

Ni `src/start.ts`, ni `src/useIsDark/`, ni `getHtmlAttributes`. La file `registerEffectAction` est
conservée : elle synchronise `$isAfterFirstEffect`, qui garantit que `useIsDarkClientSide` bascule
de `ssrWasPerformedWithIsDark` vers la valeur client après hydratation. Cette mécanique, corrigée
en mars 2025 à la suite de la discussion #398, n'est pas touchée.

**Bilan du diff `react-dsfr`** : deux attributs, un `useEffect` décommenté, une annotation
`@deprecated`.

## §4 — Validation

### §4.1 — Application de reproduction

Nouvelle application `test/integration/next-app-router-streaming/`, **Next 15 + React 19**,
minimale (ni MUI, ni gestion du consentement).

Une nouvelle application plutôt qu'une extension de `test/integration/next-appdir` : cette dernière
est figée sur Next 13.5.1 / React 18.2, or la sémantique des erreurs d'hydratation a changé en
React 19 — c'est celle-ci qui nous intéresse, et c'est celle de l'issue #464.

Deux routes :

- `/streaming` — un shell immédiat, puis un `<Suspense>` autour d'un Server Component qui
  `await sleep(1500)` avant de rendre les composants les plus instrumentés : `Table`, `Tabs`,
  `Accordion`, `Modal` et son `Button`, `SegmentedControl`, `Tooltip`, `ButtonsGroup` (equisized),
  `Range`.
- `/no-streaming` — les mêmes composants sans `<Suspense>`, pour isoler ce qui est imputable au
  streaming de ce qui ne l'est pas.

### §4.2 — Étape 1 du plan : mesurer avant de patcher

Sur `main`, sans aucune modification, relever par composant :

- les messages console classés : `Extra attributes from the server`, `did not match`,
  `Hydration failed`, `error while hydrating`
- si React a réellement re-rendu le boundary côté client, via `onRecoverableError`
- le comportement **en build de production** (`next build && next start`), et pas seulement en
  développement
- la présence d'`id` auto-générés par `retrieveNodeId` (ligne #6 de l'audit) : le moteur émet un
  `warn` explicite dans ce cas, ce qui rend la vérification triviale

Ce relevé décide si le patch de §2 part tel quel, réduit ou étendu. **Si la mesure montre qu'aucune
casse ne survient en production, ce résultat sera énoncé tel quel** et la PR change de nature : elle
devient une PR de propreté et de DX, ce qui reste utile mais se défend sur d'autres arguments.

Cette étape précède toute modification de code.

### §4.3 — Tests unitaires (vitest, `test/runtime/`)

- **Test de garde du patch** — le plus important. Charger `dsfr/dsfr.module.js` (le fichier vendu,
  donc patché) dans jsdom, poser `window.dsfr = { mode: "react" }`, injecter du markup DSFR, et
  asserter qu'aucun `data-fr-js-*` n'apparaît hormis `data-fr-js-table`, `data-fr-js-range` et le
  `data-fr-js` racine. Ce test échoue bruyamment le jour où une montée de version de
  `@gouvfr/dsfr` fait sauter le patch — c'est le risque de maintenance principal de ce design.
- **Non-régression inverse** : en `mode: "auto"`, tous les attributs sont toujours posés. Les
  consommateurs non-React ne sont pas affectés.
- **Idempotence de `dsfrEffect()`** : `DsfrProvider` seul, puis avec `StartDsfrOnHydration` monté en
  plus.

### §4.4 — Test e2e (local, hors CI)

Playwright pointé sur le Chrome système (`/usr/bin/google-chrome`, `channel: "chrome"`) — sans
téléchargement de navigateur.

1. `next build && next start` de l'application de reproduction
2. navigation vers `/streaming`, collecte de `page.on("console")` et `page.on("pageerror")`
3. assertion : aucun message d'hydratation
4. **assertion fonctionnelle** : une fois le contenu streamé arrivé, le `Modal` s'ouvre au clic,
   l'`Accordion` se déplie, les `Tabs` changent d'onglet, le `Table` affiche ses ombres de scroll
5. le test doit **échouer sur `main`** et passer avec le fix ; les deux sens sont vérifiés

Le point 4 est essentiel : le risque de ce design n'est pas de casser l'hydratation, c'est de casser
le **fonctionnement** de DSFR — une instance jamais créée, une mesure jamais faite à cause du
décalage rAF de §2.2.

**Intégration CI** : l'e2e n'est pas ajouté à la CI du dépôt. Il sert à prouver le fix et à
documenter la PR, sans imposer une infrastructure navigateur au mainteneur. Les tests vitest de
§4.3, eux, rejoignent la CI existante.

## §5 — Stratégie amont

Deux temps, assumés dès la conception :

1. PR sur `codegouvfr/react-dsfr`, comportement livré via `patch-package` — disponible immédiatement
   pour les applications.
2. PR sur `GouvernementFR/dsfr` pour que le moteur porte nativement le comportement, après quoi le
   patch est supprimé.

**Ce que le second temps impose au patch** : il doit être écrit comme du code DSFR idiomatique,
transposable tel quel en amont.

- Le patch s'appuie exclusivement sur `api.mode === Modes.REACT`, qui existe déjà dans le moteur et
  porte déjà cette intention. Aucun flag privé `react-dsfr`, aucune convention inventée.
- Les trois modifications de §2 restent indépendantes.
- L'audit de la section « Audit » est rédigé pour être repris comme corps de la PR amont : c'est le
  tableau des 46 registrations qui démontre que le changement est borné.

La documentation officielle DSFR annonce elle-même : *« à venir : implémentation spécifique pour
lancement du moteur une fois React initialisé »*. La PR amont ne demande donc pas une inflexion,
elle propose une implémentation de quelque chose de déjà inscrit à leur feuille de route.

## Risques et limites

| Risque | Traitement |
|---|---|
| Le patch est indexé sur `@gouvfr/dsfr@1.14.2` et saute à la montée de version | Le test de garde de §4.3 échoue bruyamment. C'est sa raison d'être. |
| Le décalage rAF de §2.2 fait perdre un clic dans les ~16 ms suivant l'insertion | Documenté dans la PR ; couvert par l'assertion fonctionnelle de §4.4 |
| Le markup DSFR écrit à la main par une application n'est pas couvert | Hors périmètre. Le patch n'exige rien du markup, il retire des mutations : aucune régression pour ces applications. |
| L'issue #464 pourrait avoir une cause côté Next (`useSearchParams`) sans rapport | La route `/no-streaming` de §4.1 sert à isoler ce cas |
| La mesure de §4.2 pourrait montrer qu'il n'y a pas de casse en production | Le résultat est énoncé tel quel ; la PR devient une PR de propreté et de DX |

## Critères d'acceptation

1. Le relevé de §4.2 est produit et documenté, **avant** toute modification de code.
2. Sur `/streaming` en build de production, aucun message d'hydratation n'est émis.
3. Après arrivée du contenu streamé, les composants DSFR restent pleinement fonctionnels
   (`Modal`, `Accordion`, `Tabs`, `Table`).
4. Une application montant `<StartDsfrOnHydration />` continue de fonctionner sans modification.
5. Une application ne le montant pas fonctionne également.
6. En `mode: "auto"`, le moteur pose toujours l'intégralité des `data-fr-js-*`.
7. Le test e2e échoue sur `main` et passe avec le fix.
