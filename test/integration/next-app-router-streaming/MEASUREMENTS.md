# Relevé de référence — hydratation et streaming

Mesuré le 2026-09-02 sur `7f0607953f0c38e8a7569c2a079f8129845a709f` (`main`,
`v1.34.0`), sans aucune modification du moteur (`src/next-app-router/DsfrProvider.tsx`
inchangé, `dsfrEffect()` toujours appelé uniquement via `<StartDsfrOnHydration />`).

Environnement : Next 15.1.6, React 19.0.0, Chrome 152.0.7977.64, dsfr (moteur
JS) version 1.14.2 (loggée par le moteur lui-même à l'exécution).

Méthode d'observation : script Node avec `puppeteer-core` piloté vers
`/usr/bin/google-chrome` (headless), une page dans un `BrowserContext` isolé
par route pour éviter toute pollution inter-navigation (cookies, cache HTTP).
Chaque route est ouverte, on attend `networkidle0` puis 3 secondes
supplémentaires (laisser le temps à l'hydratation et au streaming Suspense de
se stabiliser), et tous les messages de console (`console.*`, `pageerror`,
requêtes réseau en échec) sont capturés. Les outils MCP `chrome-devtools`
n'ont pas été essayés en premier : le script Puppeteer permettait de
scripter la comparaison dev/prod × 3 routes de façon reproductible et d'itérer
rapidement pendant le diagnostic des blocages d'installation (voir plus bas).

## Écarts par rapport à une installation standard

Trois écarts ont été nécessaires pour que l'application démarre et compile,
tous découverts pendant l'exécution de cette tâche, testés, puis arbitrés et
autorisés explicitement avant application (voir historique de la Task 1) :

| Écart | Fichier | Raison |
|---|---|---|
| `"@codegouvfr/react-dsfr": "file:../../../dist"` au lieu de `link:../../../dist` | `package.json` | `link:` (symlink) casse la résolution webpack des assets du package (favicon png/svg/ico, polices woff2) en dev **et** en prod ; `file:` (copie réelle) fonctionne, comme déjà pratiqué par `test/integration/next-appdir` et `test/integration/next-pagesdir`. Coût : un `yarn install` (voire `--force`) est nécessaire après tout rebuild de `dist/` pour que la copie ne devienne pas périmée — **à refaire avant toute nouvelle mesure si le moteur est modifié dans les tâches suivantes**. |
| `"build": "node --stack-size=8000 node_modules/.bin/next build"` au lieu de `"next build"` | `package.json` | Le webpack build de Next plante avec `RangeError: Maximum call stack size exceeded` en parsant le module généré pour `dsfr_plus_icons.scss` (`@use` de `dsfr.min.css` + `icons.min.css`, minifiés, ~2700 `url()` au total). Indépendant du protocole `link:`/`file:` (reproduit à l'identique dans les deux cas). N'affecte que le **build** ; `next start` (le runtime mesuré ci-dessous) tourne avec la pile V8 par défaut, sans modification. |
| `typescript: { ignoreBuildErrors: true }` dans `next.config.js` | `next.config.js` | `dist/` est compilé avec les types du `package.json` racine du dépôt (`@types/react@18.0.21`), incompatibles avec les types React 19 qu'exige cette app de mesure (elle-même correcte par ailleurs — voir triage `tsc` ci-dessous). Ne masque que l'incompatibilité de types de la bibliothèque, pas d'éventuelles erreurs dans nos propres fichiers (vérifié séparément, voir ci-dessous) ; sans impact sur le JS effectivement généré (`✓ Compiled successfully` s'affiche avant ce gate de typecheck, qui est un contrôle statique additionnel, pas une étape de compilation). |

### Triage `tsc --noEmit` séparé (vérifie que le gate désactivé ne masque pas nos propres bugs)

`npx tsc --noEmit` (sans le gate de build désactivé, donc sans filtrage) donne
exactement 2 erreurs, toutes deux dans nos propres fichiers mais toutes deux
imputables aux types de la bibliothèque, pas à notre logique :

- `app/dsfr-bootstrap/index.tsx:18` — `'DsfrProviderBase' cannot be used as a JSX component` (import direct de `@codegouvfr/react-dsfr/next-app-router`).
- `app/dsfr-bootstrap/server-only.tsx:12` — `'DsfrHeadBase' cannot be used as a JSX component` (import direct de `@codegouvfr/react-dsfr/next-app-router/server-only-index`).

Zéro erreur à l'intérieur de `node_modules/@codegouvfr/**` lui-même
(`skipLibCheck: true` les masque, comme prévu par le `tsconfig.json` du
brief). Zéro erreur dans `DsfrShowcase.tsx` ni dans les 3 routes
(`streaming`, `no-streaming`, `streaming-legacy`) — c'est-à-dire tout le code
qui utilise réellement les composants DSFR (`Accordion`, `Table`, `Tabs`,
etc.) type-check sans problème sous React 19. Le tri est donc net : les 2
seules erreurs viennent de l'usage direct de `DsfrProviderBase`/`DsfrHeadBase`
(deux fonctions exportées par la bibliothèque), pas d'un défaut dans le reste
de l'app. Aucune erreur « à nous » à corriger dans cette tâche.

### Vérification : incompatibilité réelle ou copies multiples de `@types/react` ?

```
$ find test/integration/next-app-router-streaming/node_modules -type d -name react -path "*@types*"
node_modules/@types/react
```

Réinstallé strictement depuis le `yarn.lock` commité (`node_modules`
supprimé, `yarn install --frozen-lockfile`) : **une seule** copie de
`@types/react`, en `19.0.0`. Le lockfile fusionne bien
`"@types/react@*", "@types/react@19.0.0":` en une entrée unique — c'est
l'état reproductible depuis le livrable, et c'est celui qu'il faut retenir.

Pendant le diagnostic initial, une séquence d'expérimentation différente
(suppression du `yarn.lock` lui-même puis résolution entièrement fraîche,
avant l'ajout puis le retrait d'un champ `resolutions` de test) avait fait
apparaître une seconde copie imbriquée sous `@types/react-dom` en `19.2.18`.
Ce doublon ne se reproduit pas depuis l'état commité ci-dessus : c'était un
artefact ponctuel de cette séquence d'expérimentation précise, pas un fait
stable de l'installation livrée, et il ne faut pas s'y fier.

Ce qui reste, et qui établit la conclusion, c'est la vérification faite
pendant cette même expérimentation : avec une résolution forcée à une seule
copie de `@types/react@19.0.0` (via un `resolutions` de test, retiré depuis),
`tsc --noEmit` donnait déjà les deux mêmes erreurs, caractère pour caractère,
que celles obtenues ci-dessous depuis l'installation normale. Rejoué
maintenant depuis le `yarn.lock` commité — qui ne contient lui-même qu'une
seule copie, sans artifice — le résultat est identique :

```
app/dsfr-bootstrap/index.tsx(18,10): error TS2786: 'DsfrProviderBase' cannot be used as a JSX component.
app/dsfr-bootstrap/server-only.tsx(12,13): error TS2786: 'DsfrHeadBase' cannot be used as a JSX component.
```

Une seule copie de `@types/react@19.0.0`, dans les deux cas (résolution
forcée pendant le diagnostic, et installation normale depuis le lockfile
commité), donne les deux mêmes erreurs. L'incompatibilité est donc réelle et
imputable aux `.d.ts` publiés dans `dist/` (compilés contre React 18), pas à
une copie multiple de `@types/react` — il n'y en a d'ailleurs pas dans
l'installation livrée.

## `/streaming` — développement

Un unique appel `console.error` de React 19 (« A tree hydrated but some
attributes of the server rendered HTML didn't match the client properties…
») contient un diff complet de l'arbre. Il ne correspond à aucun des motifs
littéraux demandés au Step 8 — dont `did not match` — parce que React 19 a
reformulé ce message (`didn't match`, avec l'apostrophe contractée) : un
`grep` strict sur les motifs fournis ne l'aurait pas trouvé, seule une
lecture complète des messages de console l'a révélé. Décomposé par
composant ci-dessous (toutes les lignes proviennent du même unique message) :

| Composant | Message | Catégorie |
|---|---|---|
| Accordion | `data-fr-js-accordion`, `data-fr-js-collapse-button`, `data-fr-js-collapse` absents côté client au moment du diff ; texte du bouton (« Accordéon de test ») et du contenu divergents | erreur |
| Table | `data-fr-js-table`, `data-fr-js-table-element`, `data-fr-js-table-caption`, `data-fr-js-table-row` (×2) absents ; style `--table-offset` absent ; texte de légende divergent | erreur |
| Tabs | `data-fr-js-tabs-group`, `data-fr-js-tabs-list` absents ; style `--tabs-list-height` absent ; `aria-selected` (`"false"` → `true`) et `className` du panneau (`fr-tabs__panel` → `fr-tabs__panel fr-tabs__panel--selected`) divergents ; `data-fr-js-tab-button`/`data-fr-js-tab-panel` absents ; texte des onglets (« Onglet 1 », « Onglet 2 ») divergent | erreur |
| SegmentedControl | `data-fr-js-segmented`, `data-fr-js-segmented-element` (×2) absents | erreur |
| ButtonsGroup | `data-fr-js-equisizeds-group`, `data-fr-js-equisized` (×2) absents ; style `--equisized-width` absent ; texte des boutons (« Bouton un », « Bouton deux ») divergent | erreur |
| Range | `data-fr-js-range`, `data-fr-js-range-input`, `data-fr-js-range-output`, `data-fr-js-range-limit` (×2) absents ; style `--progress-right` absent ; texte des bornes (« 0 », « 100 ») divergent | erreur |
| Button / Tooltip | `data-fr-js-tooltip-referent` (×2), `data-fr-js-tooltip` absents ; texte du bouton (« Survolez-moi ») et de l'infobulle (« Texte d'infobulle ») divergents | erreur |

Motif `add id '…' to …` (retrieveNodeId) : absent. Motifs `Extra attributes
from the server`, `Hydration failed`, `There was an error while hydrating` :
absents littéralement (voir ci-dessus pour la nuance sur `did not match`).

Effet de bord observé, sans rapport avec DSFR : ~24 requêtes
`Failed to load resource: 431 (Request Header Fields Too Large)` vers
`/__nextjs_original-stack-frame?...&errorMessage=<le message ci-dessus,
URL-encodé>` — c'est l'overlay d'erreur de `next dev` qui tente de récupérer
l'emplacement source de CHAQUE ligne du diff pour l'afficher, et l'URL générée
dépasse la limite de taille d'en-tête du serveur de dev. Conséquence
mécanique du message d'hydratation ci-dessus, propre au mode développement
(pas d'overlay en production), pas une divergence supplémentaire à recenser.

`/streaming-legacy` — développement : diff strictement identique (mêmes
composants, mêmes attributs, même texte), ~24 requêtes 431 identiques. Non
demandé par le Step 8 mais mesuré pour cohérence avec le critère d'acceptation
n°4 (l'app qui garde `<StartDsfrOnHydration />` doit continuer à fonctionner).

`/no-streaming` — développement (non demandé par le Step 8, mesuré pour
comparaison) : aucun message ne correspond à un motif recherché. Console
strictement limitée aux 2 lignes de démarrage du moteur DSFR
(`dsfr : version 1.14.2`, `dsfr : mode set to react`) plus le message
« Download the React DevTools » de React lui-même. **Aucune divergence
d'hydratation en développement sur cette route.**

## `/streaming` — production (`next build && next start`)

| Composant | Message | Catégorie |
|---|---|---|
| — | *(aucun message ne correspond à un motif recherché — voir aussi note ci-dessous)* | — |

Console entière de la page (hors les 2 lignes de démarrage du moteur DSFR) :
vide. Zéro `console.error`, zéro `console.warn`, zéro `pageerror`, zéro
requête en échec. C'est un résultat honnête, pas une lacune de méthode :
même diff, même composants, même délai de streaming (1,5 s, confirmé par le
TTFB à 5 ms et un temps total de 1,5 s via `curl -w`, preuve que le
streaming HTTP a bien eu lieu), et pourtant **aucun message d'hydratation
n'apparaît en production**, contrairement au développement ci-dessus.

## `/no-streaming` — production

| Composant | Message | Catégorie |
|---|---|---|
| — | *(aucun message ne correspond à un motif recherché)* | — |

Console entière : identique à `/streaming` en production — seulement les 2
lignes de démarrage du moteur DSFR, aucune erreur ni avertissement.

`/streaming-legacy` — production (non demandé par le Step 9, mesuré pour le
critère d'acceptation n°4) : même résultat, console vide hors démarrage du
moteur. L'app qui garde `<StartDsfrOnHydration />` fonctionne donc sans
modification, sans régression visible.

## Boundary re-rendu côté client ?

Non. Le motif `There was an error while hydrating this Suspense boundary`
n'apparaît dans aucune des consoles de production (`/streaming`,
`/no-streaming`, `/streaming-legacy`), ni dans celles de développement — sa
seule présence attesterait un remontage/re-rendu forcé du boundary Suspense
par React après un échec d'hydratation. Son absence totale, combinée au fait
que le HTML final contient bien `data-testid="dsfr-showcase"` sur les trois
routes (vérifié via `curl` sur le build de production), est la preuve
attendue par le Step 9 : aucun boundary n'a dû être re-rendu côté client.

## Conclusion

Le patch conçu en §2 est **justifié tel quel** : en développement, le
streaming (`/streaming`, `/streaming-legacy`) déclenche un unique message
React 19 « A tree hydrated but some attributes... didn't match » listant de
nombreux attributs `data-fr-js-*` (et du texte) que le moteur DSFR ajoute
après coup, alors que `/no-streaming` reste parfaitement silencieux — donc
la divergence est bien imputable au streaming, pas à DSFR en général ; mais
en production — l'étape décisive selon la spec — **les trois routes sont
strictement silencieuses**, sans aucune trace de ce diff ni d'un
remontage de boundary, ce qui confirme que le bruit observé en développement
est un avertissement de dev (React ne le remonte qu'en mode développement)
et non une casse réelle observable par un utilisateur final. Le patch peut
donc procéder tel que conçu, sans réduction ni extension de périmètre motivée
par ce relevé.

## Vérification e2e : échec sans patch, succès avec

Titre de section conservé tel que spécifié par la Task 6, mais **le résultat
ne suit pas ce schéma** : voir le constat ci-dessous, rapporté intégralement
sans atténuation de l'assertion qui l'a révélé (Step 5 de la Task 6, exécuté
le 2026-09-02).

Les trois tests de `test/e2e/streaming.spec.ts` ont été exécutés deux fois
contre `next dev`, Chrome système (`channel: "chrome"`) :

1. **Avec le patch** `@gouvfr/dsfr` (état normal du dépôt, `dist/` reconstruit,
   copie de l'app d'intégration réinstallée avec `--force`, vérifié par
   `grep -c CSS_BOUND_JS_ATTRIBUTES … = 2`) : **2 tests échouent, 1 passe.**
2. **Sans le patch** (moteur `@gouvfr/dsfr` vierge — `patches/` déplacé hors
   du répertoire de travail avant un `yarn install --frozen-lockfile --force`
   qui a forcé un réinstall propre de `node_modules/@gouvfr/dsfr`, vérifié par
   `grep -c "^        /\*$" … = 0` et par `grep -c CSS_BOUND_JS_ATTRIBUTES … = 0`,
   puis `dist/` et la copie de l'app reconstruits à l'identique) :
   **2 tests échouent, 1 passe — résultat strictement identique, caractère
   pour caractère, au précédent.**

| Test | Avec patch | Sans patch |
|---|---|---|
| `streaming : aucune divergence d'hydratation, moteur fonctionnel` | ÉCHEC | ÉCHEC (diff identique) |
| `StartDsfrOnHydration monté : toujours fonctionnel` | ÉCHEC | ÉCHEC (diff identique) |
| `sans streaming : aucune divergence d'hydratation` | PASSE | PASSE |

Dans les deux configurations, `page.on("pageerror")` capture le même message,
au caractère près, sur `/streaming` et `/streaming-legacy` (jamais sur
`/no-streaming`) :

> Hydration failed because the server rendered HTML didn't match the client.
> As a result this tree will be regenerated on the client. […]

C'est un message **différent** de celui mesuré en Task 1 (« A tree hydrated
but some attributes… didn't match », remonté via `console.error`, sans
remontage d'arbre). Celui-ci est remonté via l'événement `pageerror` (une
exception, pas un simple avertissement), et il annonce explicitement que
React regénère tout le sous-arbre côté client.

Le diff imprimé par React dans ce message ne contient **aucune mention** des
attributs `data-fr-js-*` (le motif qui était visible dans le relevé de la
Task 1 et que le patch `CSS_BOUND_JS_ATTRIBUTES` cible spécifiquement). Les
seules paires `-`/`+` réellement appariées (une valeur serveur explicitement
opposée à une valeur client, à l'inverse des lignes portant un seul signe qui
ne sont que le rendu du sous-arbre régénéré) portent sur :

- `aria-selected` du premier onglet : `"false"` (serveur) → `true` (client) ;
- `className` du panneau associé : `"fr-tabs__panel"` → `"fr-tabs__panel fr-tabs__panel--selected"`.

Les autres lignes marquées (`className=""` du `<table>`, `style` avec
`--tabs-list-height`, `--equisized-width`, la sortie du curseur `Range`) n'ont
qu'un seul signe, sans valeur opposée explicite : elles décrivent l'état du
sous-arbre régénéré côté client (où la classe/le style disparaissent, car
DSFR ne les a pas encore recalculés au moment de ce nouveau rendu), pas des
paires serveur/client contradictoires au même titre que `aria-selected`.

**Lecture.** Le patch Task 2 (attributs `data-fr-js-*` limités + parsing des
nœuds ajoutés différé d'une frame) est bien inopérant sur ce défaut résiduel
précisément parce que ce défaut n'a jamais porté sur les attributs
`data-fr-js-*` : le moteur DSFR, en initialisant `Tabs` sur du contenu arrivé
par streaming, sélectionne le premier onglet (`aria-selected`, classe
`--selected`) — une mutation que rien dans les Tasks 2 à 5 ne différait pour
ce cas précis. `/no-streaming` reste indemne dans les deux configurations
testées, ce qui est cohérent avec la conception de `DsfrProvider` (Task 5) :
les effets des enfants s'exécutant avant celui du parent, `window.dsfr.start()`
n'est déclenché qu'après que **tout** l'arbre initial a fini de s'hydrater —
mais sur `/streaming` et `/streaming-legacy`, cet arbre initial ne contient
que le shell et le fallback (le vrai contenu arrive dans un commit ultérieur,
après coup), donc `isAfterFirstEffect` passe à `true` trop tôt par rapport à
l'hydratation du contenu réellement streamé.

**Conséquence pour cette tâche.** Le critère du Step 5 (« le premier test
échoue sans le patch, puis passe avec ») **n'est pas rempli** : le premier et
le deuxième test échouent identiquement dans les deux configurations. Ce test
e2e prouve donc uniquement ce que confirme la troisième assertion : la route
sans streaming est saine, avec ou sans le patch `@gouvfr/dsfr`. Il ne
démontre pas que les Tasks 2 à 5 rendent les routes de streaming silencieuses
en développement — elles ne le sont pas, pour une raison distincte de celle
que ces tâches ciblaient. Conformément à la consigne de la Task 6, cette
assertion n'a pas été affaiblie pour faire passer le test : le message est
rapporté ici intégralement plutôt que masqué.
