# Résolution de COVERAGE.md §8 : le bruit `data-fr-js-*` sur la page combinée

Enquête menée le 2026-09-03, sur la branche `agent/hydratation`. Fait suite
à `COVERAGE.md` §8, qui signalait — sans l'expliquer — la réapparition
d'attributs `data-fr-js-*` dans le diff d'hydratation React de la page
combinée `/streaming` (19 familles), alors que ces mêmes familles étaient
propres mesurées isolément avec le même patch.

## Cause

**Cache webpack persistant de Next.js périmé**
(`.next/cache/webpack/{client,server}-development/*.pack.gz`), pas un
défaut du patch `patches/@gouvfr+dsfr+1.14.2.patch`.

`@codegouvfr/react-dsfr` est une dépendance `file:` de cette app
(`"@codegouvfr/react-dsfr": "file:../../../dist"`). `yarn install --force`
recopie bien le contenu à jour de `dist/` dans `node_modules/`, mais
webpack traite les chemins sous `node_modules` comme « managés » : leur
contenu est supposé stable tant que le numéro de version du paquet ne
change pas. Une dépendance `file:` recopiée garde le même numéro de
version à chaque recopie — rien ne signale donc à webpack qu'il doit
relire le fichier. Un serveur `next dev` démarré avant un cycle
`yarn build` + `yarn install --force` peut continuer à servir,
indéfiniment (y compris après plusieurs cycles ultérieurs corrects), la
version du module qu'il a compilée à son tout premier démarrage.

C'est exactement ce qui s'est produit : le fichier sur disque
(`node_modules/@codegouvfr/react-dsfr/dsfr/dsfr.module.js`) contenait bien
la ligne patchée, mais le chunk webpack réellement envoyé au navigateur
(vérifié en récupérant son contenu, `devtool: eval-source-map` en dev,
code source lisible en clair) contenait encore la ligne **non patchée** :

```js
if (this.jsAttribute) this.setAttribute(registration.attribute, true);
```

au lieu de la ligne patchée :

```js
if (this.jsAttribute && (options.mode !== Modes.REACT || CSS_BOUND_JS_ATTRIBUTES.indexOf(registration.attribute) > -1)) this.setAttribute(registration.attribute, true);
```

Ce phénomène n'a **rien à voir avec le nombre de familles ou la charge du
moteur DSFR au scan initial** : deux mesures faites au même moment contre
le même serveur de dev périmé auraient montré le même bruit, y compris en
isolation. La coïncidence observée avec « page combinée » dans les mesures
antérieures tient à l'ordre des opérations (quel serveur de dev tournait
au moment de quelle mesure), pas à un effet de charge.

## Preuve

Instrumentation par injection (`page.addInitScript`, scripts ad hoc hors
dépôt, jamais commités) sur le serveur de dev *avant* nettoyage :

- `window.dsfr` n'est écrit que 2 fois sur toute la session (le
  placeholder de `start.ts`, puis le vrai bootstrap) — un seul moteur
  chargé, pas deux.
- `Object.defineProperty(obj, 'mode', {get,set})` — la ligne exacte du
  bootstrap qui crée l'accesseur `mode` — n'est interceptée qu'une seule
  fois ; l'objet capturé est bien `window.dsfr`, avec `.mode === "react"`
  en continu.
- Pourtant, `Array.prototype.indexOf` intercepté et filtré sur
  `CSS_BOUND_JS_ATTRIBUTES` (`['data-fr-js-range','data-fr-js-table']`)
  n'était jamais appelé : la clause du patch n'était donc jamais atteinte
  — preuve indirecte mais univoque que le code exécuté n'était pas le code
  patché, confirmée ensuite directement en lisant le chunk livré au
  navigateur.

Après arrêt du serveur, suppression complète de `.next` (pas seulement de
`node_modules/@gouvfr/dsfr`), redémarrage à froid :

- Le DOM final de `/streaming` ne contient plus que `data-fr-js-range` et
  `data-fr-js-table` (les deux attributs de l'allowlist
  `CSS_BOUND_JS_ATTRIBUTES`).
- `Array.prototype.indexOf` sur `CSS_BOUND_JS_ATTRIBUTES` est désormais
  appelé 132 fois, chaque fois renvoyant `-1` pour les attributs hors
  allowlist — le patch bloque correctement les 44 attributs visés.
- `test/e2e/streaming.spec.ts` (non modifié) : 2 échecs / 1 succès,
  identique au comportement déjà documenté par ailleurs — les deux échecs
  restants concernent des divergences déjà connues et sans rapport avec
  `data-fr-js-*` (`tab`/`table`/`range`), pas visées par ce patch.

Le rapport complet de l'enquête, avec le détail des quatre hypothèses
testées et écartées une à une par instrumentation directe, est dans
`.superpowers/sdd/2026-09-02-dsfr-ssr-streaming-hydration/load-effect-report.md`.

## À retenir pour toute mesure future sur cette app

Avant toute mesure impliquant `@gouvfr/dsfr`/`@codegouvfr/react-dsfr`
(patch retiré, restauré, ou simple rebuild) : arrêter le serveur de dev
Next.js, supprimer `.next` en entier
(`node -e "require('fs').rmSync('.next', {recursive:true, force:true})"`),
puis redémarrer — **avant** la mesure, systématiquement, pas seulement
après un changement du patch. `yarn install --force` seul ne suffit pas :
il met à jour `node_modules`, pas le cache webpack de Next.js, qui peut
continuer à servir une version compilée périmée du module tant qu'il n'est
pas explicitement invalidé.
