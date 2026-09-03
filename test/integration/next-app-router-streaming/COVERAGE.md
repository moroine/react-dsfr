# Couverture des familles moteur DSFR — relevé

Mesuré le 2026-09-03, sur la branche `agent/hydratation`, avec et sans le
patch `patches/@gouvfr+dsfr+1.14.2.patch` (Tasks 2-5). Ce document ne
documente **pas** un état antérieur (contrairement à `MEASUREMENTS.md`,
volontairement non modifié) : il documente les 12 familles moteur DSFR
qu'aucune tâche précédente n'avait exercées, plus une vérification croisée
sur les 7 déjà couvertes.

## 1. Ce qui a été étendu

`app/DsfrShowcase.tsx` a été réécrit pour composer une liste déclarative de
familles (`app/dsfr-families.tsx`), une entrée par famille moteur DSFR
instrumentée, chacune encapsulée dans `<div data-testid="famille-<id>">`.
Les 7 familles déjà couvertes (accordion, table, tab, segmented, button,
range, tooltip) ont été reprises telles quelles dans cette liste, sans
changement de props. Les 12 familles ajoutées :

| id (`data-testid`) | Composant react-dsfr | Source |
|---|---|---|
| `breadcrumb` | `Breadcrumb` | `src/Breadcrumb.tsx` |
| `card` | `Card` | `src/Card.tsx` |
| `checkbox` | `Checkbox` | `src/Checkbox.tsx` |
| `display` | `Display` | `src/Display/Display.tsx` |
| `header` | `Header` | `src/Header/Header.tsx` |
| `modal` | `Modal` via `createModal` | `src/Modal/Modal.tsx` |
| `navigation` | `MainNavigation` | `src/MainNavigation/MainNavigation.tsx` |
| `password` | `PasswordInput` | `src/blocks/PasswordInput.tsx` |
| `sidemenu` | `SideMenu` | `src/SideMenu.tsx` |
| `tag` | `Tag` (variantes pressable + dismissible) | `src/Tag.tsx` |
| `tile` | `Tile` | `src/Tile.tsx` |
| `toggle` | `ToggleSwitch` (via `app/ToggleSwitchShowcase.tsx`) | `src/ToggleSwitch.tsx` |

`createModal()` est appelé au niveau module dans `dsfr-families.tsx`, hors
de tout composant, conformément à `src/Modal/Modal.tsx`.

**Découverte pendant l'implémentation, avant toute mesure — un bug latent
(hors périmètre, non corrigé) :** `src/ToggleSwitch.tsx` utilise
`useState`/`useEffect` en interne mais ne déclare pas `"use client"`
lui-même (à la différence de `Range.tsx` ou de `blocks/PasswordInput.tsx`,
qui le font). L'utiliser directement dans `DsfrShowcase.tsx` (Server
Component) fait échouer le rendu RSC avec `TypeError: useState only works
in Client Components`. Isolé dans `app/ToggleSwitchShowcase.tsx`
(`"use client"`), conformément à la consigne du brief. Ce n'est pas un défaut
de l'app de repro : c'est une incohérence de `src/ToggleSwitch.tsx` que je
n'ai pas corrigée (hors mandat de cette tâche — mesure, pas correctif).

Tous les autres composants ajoutés (`Header`, `MainNavigation`, `Display`,
`Modal`, `SideMenu`, `Card`, `Tag`, `Tile`, `Breadcrumb`, `Checkbox`) sont
utilisables tels quels dans un Server Component : aucun n'a besoin de
`useState`/`useEffect` pour son rendu initial (`Breadcrumb` utilise `useId`,
qui fonctionne dans un Server Component). `Menu` (sous-composant interne de
`MainNavigation`) et `SearchButton` (sous-composant interne de `Header`,
utilisé seulement si une recherche est configurée) déclarent `"use client"`
eux-mêmes ; les composer directement depuis `MainNavigation`/`Header` (eux
Server Components) est le fonctionnement normal de Next — aucune isolation
supplémentaire nécessaire.

## 2. Un problème de méthode découvert en cours de route : le diff React est tronqué

La première mesure (patch en place, toutes les familles réunies dans
`DsfrShowcase.tsx`, comme demandé) a bien reproduit le `pageerror`
« Hydration failed… » déjà connu sur `/streaming`. Mais le diff imprimé par
React **s'arrête net après la famille `range`** (la dernière des 7
familles déjà couvertes) — aucune des 12 nouvelles familles, qui suivent
dans l'arbre, n'apparaît dans le message, même pas sous une forme tronquée
partielle : le message se termine simplement par une série de `...`
imbriqués puis rien. Ce n'est pas une élision normale de sous-arbre (React
utilise aussi `...` pour ça, localement, à l'intérieur d'un nœud sans
diff) : ici, c'est la liste des **frères de plus haut niveau** qui s'arrête,
preuve vérifiée en comparant la longueur du message (5329 caractères, fin
franche, pas de troncature réseau ou de log) et en confirmant qu'aucune
famille au-delà de `range` n'apparaît sous quelque forme que ce soit.

**Conséquence directe pour l'honnêteté de la mesure :** attribuer un
verdict aux 12 nouvelles familles à partir de ce seul message aurait été
trompeur — leur absence dans le diff ne prouve rien (ni divergence, ni
absence de divergence), elle signifie seulement « React a arrêté d'écrire
avant de les atteindre ».

**Solution retenue :** deux routes de mesure supplémentaires,
`app/streaming/family/[name]/page.tsx` et
`app/no-streaming/family/[name]/page.tsx`, qui rendent **une seule famille
à la fois**, isolée, avec le même mécanisme de streaming (`Suspense` +
délai de 1,5 s côté serveur) que `/streaming`. `getDsfrFamily(name)` (dans
`dsfr-families.tsx`) sert de source commune aux deux usages (showcase
combiné et routes d'isolation), pour ne pas dupliquer les props de test.
Avec une seule famille par page, le diff n'est plus jamais tronqué (message
≤ ~2700 caractères dans tous les cas rencontrés, largement sous le seuil où
la troncature apparaît).

**Limite de cette solution, à ne pas passer sous silence :** isoler une
famille change aussi la charge de travail du moteur DSFR au moment de son
scan initial (une seule famille à traiter au lieu de 19), ce qui peut
changer les probabilités de collision de timing avec l'hydratation React
(voir §5). La mesure par isolation répond à la question « cette famille,
seule, produit-elle une divergence prouvée ? » — pas à la question « que
se passe-t-il sur une page réunissant beaucoup de composants ? », qui reste
partiellement ouverte (§5).

## 3. Méthode d'attribution (rappel, appliquée strictement)

Dans chaque diff, seules les lignes **appariées** comptent comme preuve
d'une divergence réelle : une ligne `-` portant une valeur serveur **et**
une ligne `+` juste après (ou juste avant) portant une valeur client
explicitement opposée, pour le **même attribut du même nœud**. Une ligne à
un seul signe (`-` seul ou `+` seul) ne prouve rien par elle-même : elle ne
fait que refléter l'état du sous-arbre régénéré côté client au moment où
React construit ce message (typiquement, un attribut `data-fr-js-*` que le
moteur DSFR n'a pas encore reposé sur la copie fraîchement rendue), pas une
divergence attribut-par-attribut entre ce que le serveur a réellement
envoyé et ce que le client attendait.

Un `console.error` (avertissement, l'hydratation « se rattrape » sur
l'attribut fautif) et un `pageerror` (exception « Hydration failed… », tout
le sous-arbre est regénéré) sont tous deux des signaux qu'une divergence a
été détectée ; les deux sont éligibles à contenir des lignes appariées.
Le second est strictement plus sévère (perte de l'état React du sous-arbre)
mais son diff n'est pas automatiquement « plus prouvé » que celui d'un
`console.error` — le même critère d'appariement s'applique aux deux.

## 4. Protocole de mesure

- Chrome système (`channel: "chrome"`), `playwright` (déjà présent dans
  `test/e2e/node_modules`), headless, un `BrowserContext` neuf par
  navigation.
- `page.goto(url, { waitUntil: "commit" })` sur les routes `/streaming/...`
  (nécessaire pour observer l'état avant la fin du stream, comme déjà établi
  Task 6) ; `waitUntil: "load"` sur `/no-streaming/...`.
- Attente de `[data-testid="dsfr-showcase"]` visible/attaché, puis 2,5 s
  supplémentaires pour laisser le temps aux erreurs tardives (hydratation
  asynchrone, `dsfr.start()`) de se manifester.
- Capture de **tous** les messages `console` et de l'événement `pageerror`
  (pas seulement ceux qui correspondent aux motifs de
  `test/e2e/streaming.spec.ts` — celui-ci sert de test de non-régression
  global, pas d'instrument de mesure fine par famille).
- Script ad hoc, hors dépôt (scratchpad de session, non committé) : mesure
  chaque famille dans son propre `BrowserContext`, avec et sans le patch.

**Retrait/restauration du patch — écart au protocole donné par le brief,
documenté ici.** Le brief suggérait `git stash push -u -- patches/` pour
retirer le patch. Vérifié empiriquement (deux fois, avec et sans `-u`) :
`git stash push -- <pathspec>` restaure toujours le contenu du chemin
stashé à l'état de `HEAD` une fois le stash créé — c'est le comportement
documenté de `git stash`, pas une anomalie de cet environnement. Un fichier
**suivi et commité sans modification locale préalable** (le cas de
`patches/@gouvfr+dsfr+1.14.2.patch` ici) ne peut donc pas être fait
disparaître du répertoire de travail par un simple `git stash push` sur son
chemin : la première tentative, sur un répertoire de travail propre, a
d'ailleurs donné « No local changes to save » sans aucun effet. Après
suppression manuelle du fichier puis stash de cette suppression, le fichier
était de nouveau présent (vérifié par `ls`) — la commande a fait
l'inverse de ce qu'elle est censée faire dans ce brief.

Solution retenue : copie du fichier de patch vers un emplacement hors dépôt
(scratchpad de session), suppression du fichier dans `patches/`, purge +
réinstallation de `node_modules/@gouvfr/dsfr`, vérification « moteur vierge »
(`grep -c "^        /\*$" … = 0` **et** `grep -c CSS_BOUND_JS_ATTRIBUTES … = 0`),
`yarn build`, puis `yarn install --force` dans l'app d'intégration. Pour
restaurer : copie du fichier sauvegardé vers `patches/` (`git status`
confirme un fichier identique à `HEAD`, donc aucune trace dans l'historique
Git), purge + réinstallation + `patch-package` (vérifié appliqué :
`grep -c CSS_BOUND_JS_ATTRIBUTES … = 2`), rebuild, réinstallation `--force`
dans l'app. Cette méthode n'a jamais touché la pile de stash Git partagée
entre worktrees — elle l'évite complètement, ce qui est plus sûr que la
commande du brief pour ce cas précis (fichier suivi, non modifié), tout en
respectant le même esprit (aucune suppression destructive irréversible : la
sauvegarde existe pendant toute la manipulation).

De même, `npx --yes yarn@1.22.22 install --frozen-lockfile` seul (sans
`--force`) a répondu « Already up-to-date » sans rien réinstaller après la
suppression manuelle de `node_modules/@gouvfr/dsfr` — confirmant le même
piège déjà documenté par la Task 6 dans `MEASUREMENTS.md`. `--force` a donc
été systématiquement ajouté (le brief l'omet dans son étape sans-patch,
mais l'a bien pour l'étape de restauration).

**Répétitions.** Le résultat n'est pas parfaitement déterministe d'une
exécution à l'autre pour certaines familles (voir `table`, `button`,
`toggle` ci-dessous) : le déclenchement d'un `console.error` dépend d'une
course entre le scan DSFR et l'hydratation React, sensible au bruit de
timing local. `modal` et `sidemenu` (patché) ont été mesurés 5 fois chacune
(2 mesures issues des passes complètes + 3 répétitions dédiées) pour
consolider leur verdict « clean » ; `header` et `navigation` (patché) 2 fois
chacune, avec un diff strictement identique aux deux passages. Les autres
familles reposent sur une seule mesure par état (patché/non patché) — un
run supplémentaire n'aurait pas changé la classification (« aucune ligne
appariée ») pour les familles déjà propres à 0 erreur, et la classification
est indépendante du nombre de fois qu'un `console.error` non apparié se
déclenche.

## 5. Résultats — les 12 familles ajoutées

| Famille | Avec patch | Sans patch | Verdict |
|---|---|---|---|
| `breadcrumb` | Aucune erreur (0/0) | `console.error` ×2, uniquement `data-fr-js-collapse`/`data-fr-js-collapse-button` (non appariés) + texte `+` seul | **Aucune divergence prouvée.** |
| `card` | Aucune erreur | Aucune erreur | **Aucune divergence.** Composant totalement silencieux, patché ou non. |
| `checkbox` | Aucune erreur | `console.error` ×2, uniquement `data-fr-js-checkbox-input` (non apparié) | **Aucune divergence prouvée.** |
| `display` | Aucune erreur | Aucune erreur | **Aucune divergence.** Même en interne `Display` monte une modale fermée par défaut (`createModal({isOpenedByDefault:false})`) — cohérent avec le résultat `modal` ci-dessous. |
| `header` | `console.error` ×2 (2 runs identiques), **une ligne appariée** : `aria-labelledby="fr-header-menu-button"` (client) vs `aria-labelledby={null}` (serveur) sur le `<div className="fr-header__menu fr-modal">` (menu mobile) | Même ligne appariée, plus bruit `data-fr-js-*` massif | **Divergence prouvée**, présente avec et sans le patch — le patch ne la corrige pas. |
| `modal` (`createModal({isOpenedByDefault:true})`, exercée ouverte pour solliciter réellement `ModalsGroup`) | Aucune erreur (5 runs) | `console.error` ×2, uniquement `data-fr-js-modal-button` (non apparié) + texte `+` seul | **Aucune divergence prouvée**, y compris ouverte par défaut. Contraste notable avec `header` (§6). |
| `navigation` | `console.error` ×1-2 (2 runs identiques), **deux lignes appariées** sur le menu déroulant (`<div className="fr-menu fr-collapse">`) : `className` (`"fr-menu fr-collapse"` client vs `"fr-menu fr-collapse fr-collapsing"` serveur) et `style` (`undefined` client vs `{--collapse:"-84px"}` serveur) | Mêmes deux lignes appariées, plus bruit `data-fr-js-*` | **Divergence prouvée**, présente avec et sans le patch — le patch ne la corrige pas. |
| `password` | Aucune erreur | `console.error` ×2, uniquement `data-fr-js-checkbox-input`/`data-fr-js-password-toggle` (non appariés) | **Aucune divergence prouvée.** |
| `sidemenu` (sous-menu ajouté avec `expandedByDefault: true` pour solliciter réellement `CollapsesGroup`, sinon la première mesure — sans sous-menu — ne teste rien) | Aucune erreur (5 runs : 2 sans sous-menu + 3 répétitions avec sous-menu) | `console.error` ×2, uniquement `data-fr-js-collapse`/`data-fr-js-sidemenu-list`/`data-fr-js-sidemenu-item` (non appariés) | **Aucune divergence prouvée**, y compris avec un sous-menu déplié par défaut. Contraste notable avec `navigation` (§6), pourtant bâti sur le même mécanisme `fr-collapse`. |
| `tag` | Aucune erreur (pressable et dismissible) | `console.error` ×2, uniquement `data-fr-js-toggle`/`data-fr-js-tag-dismissible` (non appariés) + texte `+` seul | **Aucune divergence prouvée.** |
| `tile` | Aucune erreur | Aucune erreur | **Aucune divergence.** Composant totalement silencieux, patché ou non. |
| `toggle` | `console.error` ×2, **uniquement des lignes à un seul signe** : `- style={{--toggle-status-width:"2.5rem"}}` et `+ Interrupteur de test` (texte, sans `-` correspondant visible avant la coupure du message) | Même motif, plus `data-fr-js-toggle-input`/`data-fr-js-toggle-status-label` (non appariés) | **Aucune divergence prouvée** au sens strict du critère d'appariement, malgré un `console.error` qui se déclenche systématiquement (2/2 côté patché, 2/2 côté non patché). Signalé séparément des familles « clean » ci-dessus car un avertissement réel est bien émis — seule la preuve d'appariement manque dans la portion visible du diff. |

**Verdict condensé — familles avec divergence prouvée : `header`, `navigation`.**
Toutes les autres (10) : aucune divergence prouvée par le critère
d'appariement, dans les deux états du patch.

## 6. Deux asymétries non résolues, signalées plutôt que masquées

1. **`header` diverge, `modal` non**, alors que les deux rendent un élément
   `.fr-modal`. Piste non vérifiée (mesure seulement, pas de correctif) :
   `Header.tsx` fixe `aria-labelledby={menuButtonId}` — un id calculé pour
   un **autre** élément (le bouton menu) — alors que `Modal.tsx` fixe
   `aria-labelledby={titleId}`, un id du **propre** sous-arbre du composant
   (`fr-modal-title-${id}`), pas de dépendance croisée à un autre nœud.
   Cette différence structurelle pourrait expliquer l'écart mais n'a pas
   été vérifiée par instrumentation supplémentaire (hors mandat de mesure).
2. **`navigation` diverge, `sidemenu` non**, alors que les deux sont bâtis
   sur `fr-collapse`/`CollapsesGroup`. Aucune hypothèse vérifiée ici.

Ces deux asymétries sont rapportées telles quelles, sans tentative
d'explication définitive : les confirmer demanderait de lire le code du
moteur DSFR au-delà de `getIndex()`/le setter `index` déjà identifiés par
la tâche précédente, ce qui sort du mandat « mesurer, ne pas corriger ».

## 7. Vérification croisée sur les 7 familles déjà couvertes (patché)

Mesurées en isolation pour valider que la méthode reproduit les résultats
connus avant de lui faire confiance sur les 12 nouvelles familles :

| Famille | Isolée, patchée | Cohérent avec le relevé antérieur ? |
|---|---|---|
| `accordion` | Aucune erreur | Oui — le patch (Tasks 2-5) corrige le bruit `data-fr-js-*` observé Task 1 (pré-patch) ; `accordion` ne force aucun index initial (`getIndex(-1)` par défaut, non surchargé), contrairement à `tab`. |
| `table` | Flaky : 0 ou 2 `console.error`, toujours non apparié (`className=""` seul) | Oui — cohérent avec le relevé Task 1/6 (« un seul signe »). |
| `tab` | `console.error` ×2, **lignes appariées** : `style` du conteneur (`undefined` vs `{--tabs-height:...}`) et `className` du panneau (`"fr-tabs__panel"` vs `"...--direction-end"`) | Oui — confirme le mécanisme déjà diagnostiqué (Task 6) : `TabsGroup.getIndex(defaultIndex = 0)` force la sélection du premier onglet à l'initialisation, avant hydratation complète du contenu streamé. |
| `segmented` | Aucune erreur | Cohérent (pas de mécanisme de disclosure forcée). |
| `button` (`ButtonsGroup` équisized) | Flaky : 0 ou 2 `console.error`, toujours non apparié (`--equisized-width` seul) | Oui — cohérent avec Task 1/6. |
| `range` | `pageerror` ×1 systématique, non apparié (`style`/texte de sortie, un seul signe) | Cohérent avec Task 1/6 (composant `suppressHydrationWarning` en partie, diff résiduel non apparié). |
| `tooltip` | Aucune erreur | Cohérent. |

Ceci confirme que `TabsGroup` est bien la seule des « 5 familles partageant
`DisclosuresGroup` » évoquées par le brief (onglets, accordéon, modale,
navigation principale, menu latéral) où le mécanisme **`getIndex` à index
forcé par défaut** s'applique — et que, parmi les 12 nouvelles familles,
deux autres divergences prouvées existent (`header`, `navigation`) mais par
un mécanisme distinct (attribut `aria-labelledby` perdu ; `className`/`style`
de mesure de hauteur du `fr-collapse`), pas par un index forcé.

## 8. Un fait à ne pas laisser de côté : bruit qui réapparaît sur la page combinée

Le test e2e existant (`test/e2e/streaming.spec.ts`, non modifié) capture
sur la page combinée `/streaming` (patchée, les 19 familles réunies) un
`console.error` qui **recommence à lister des attributs `data-fr-js-*`
pour `Accordion`, `Table`, `Tabs`**, etc. — alors que ces mêmes familles,
mesurées **isolément** avec le même patch, sont silencieuses (`accordion`)
ou ne montrent que des lignes non appariées déjà connues. Cela suggère que
le volume de composants à traiter par le moteur DSFR au chargement d'une
page très chargée peut réintroduire, par pur effet de charge/timing, du
bruit que le patch supprime sur une page plus légère — sans qu'on puisse
confirmer si ce bruit reste non apparié (comme en isolation) ou s'il
recouvre aussi les divergences prouvées de `header`/`navigation`, car ce
message se tronque lui aussi avant de les atteindre (voir §2). Ce point
reste **non résolu** par cette tâche : il est signalé pour éviter de
prétendre à tort qu'un composant « clean » en isolation l'est forcément
aussi combiné à 18 autres sur une même page.

## 10. Relevé du 2026-09-03, après la vague de correctifs de revue finale

Mesuré avec le protocole du §4 (build, `yarn install --force`, **suppression de
`.next`**, redémarrage à froid), moteur patché, `next dev`.

Une famille a été ajoutée : `accordion-expanded` — un `<Accordion
defaultExpanded>`. Elle n'était couverte par aucune mesure antérieure alors
qu'elle exerce un chemin distinct : react-dsfr rend le bouton avec
`aria-expanded="true"` mais **ne rend jamais** `fr-collapse--expanded` sur le
panneau, si bien que le moteur doit poser cette classe à l'initialisation.

De plus, les deux panneaux de la famille `tab` ont maintenant des hauteurs
délibérément très différentes : avec deux panneaux identiques, l'absence de
`--tabs-height` était strictement invisible.

| Route d'isolation | Messages | Détail |
| --- | --- | --- |
| `/streaming/family/accordion` | 0 | — |
| `/streaming/family/accordion-expanded` | 2 (avertissements) | `fr-collapse--expanded` + `fr-collapsing` + `--collapse` + nœud texte. **Diverge aussi sans les correctifs** (mesuré : 2 messages, `fr-collapse--expanded` + nœud texte). Non corrigeable côté moteur : le HTML rendu par le serveur n'exprime pas l'état ouvert. |
| `/streaming/family/tab` | 1 (avertissement) | Divergence APPARIÉE `aria-selected` / `fr-tabs__panel--selected`. **Présente à l'identique sans les correctifs** (vérifié en neutralisant les seuls hunks de `TabsGroup`) : c'est le constat C4, cause inconnue, hors périmètre de cette vague. Le HTML servi par le serveur est pourtant correct (`curl` : `aria-selected="true"` sur l'onglet 0). |
| `/streaming/family/table` | 0 | — |
| `/streaming/family/modal` | 0 | — |
| `/streaming/family/header` | 0 | — |
| `/streaming/family/navigation` | 0 | — |
| `/streaming/family/tooltip` | 0 | — |
| `/streaming/family/range` | 1 (avertissement) | Nœud texte ajouté par `RangeOutput.change` sur `.fr-range__output`. `suppressHydrationWarning` ne couvre pas un nœud absent de l'arbre client. **Sans l'attribut sur ce nœud, c'est un `pageerror` « Hydration failed » et le style `transform` diverge en plus** : l'attribut divise donc bien le défaut, sans l'éliminer. |

Page combinée `/streaming` : toujours en échec, avec les divergences de
`accordion-expanded`, `tab` (C4), `table` (`className=""` posé sur le `<table>`
enfant, hors de portée du `suppressHydrationWarning` de `.fr-table`), `button`
(`--equisized-width`, mécanisme `Equisized` non traité) et `range`.

### Comportement, mesuré en navigateur réel

| Mesure | Sans le correctif | Avec le correctif |
| --- | --- | --- |
| Hauteur de `.fr-tabs` sur `/streaming/family/tab`, avant tout clic | **684 px**, `--tabs-height` jamais posée | **156 px**, `--tabs-height: 156px` |
| Hauteur du panneau non sélectionné | 640 px | 640 px |

C'est le constat C2 : sans `--tabs-height`, le conteneur prend la hauteur du
panneau le plus haut, tous les panneaux étant superposés dans le même flux.

## 9. Reproduire

```bash
# Avec le patch (état par défaut du dépôt)
cd test/integration/next-app-router-streaming
node --stack-size=8000 node_modules/.bin/next dev -p 3100 &
# puis, dans un navigateur ou via playwright :
#   http://localhost:3100/streaming/family/<id>
#   http://localhost:3100/no-streaming/family/<id>
# <id> ∈ accordion, table, tab, segmented, button, range, tooltip,
#        breadcrumb, card, checkbox, display, header, modal,
#        navigation, password, sidemenu, tag, tile, toggle,
#        accordion-expanded
```

Pour la procédure de retrait/restauration du patch, voir §4 ci-dessus (elle
diffère de celle suggérée par le brief, pour la raison qui y est expliquée).
