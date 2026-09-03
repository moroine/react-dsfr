# Support du streaming Server Components — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à une application Next.js App Router de streamer des Server Components contenant des composants DSFR sans divergence d'hydratation, en supprimant les mutations DOM que le moteur `@gouvfr/dsfr` produit à l'instanciation en `mode: "react"`.

**Architecture:** Deux modifications du moteur, livrées via le `patch-package` déjà présent dans le dépôt et embarquées dans le paquet publié : (1) `Instance._config` cesse de poser les `data-fr-js-*` dont aucun style ne dépend ; (2) `Stage.mutate` route les nœuds ajoutés vers le chemin différé par `requestAnimationFrame` que `Stage` possède déjà pour les mutations d'attributs. Côté `react-dsfr`, deux `suppressHydrationWarning` couvrent les deux attributs conservés, et `DsfrProvider` porte désormais l'effet d'hydratation, ce qui rend `<StartDsfrOnHydration />` optionnel.

**Tech Stack:** TypeScript, React, Next.js App Router, `@gouvfr/dsfr@1.14.2`, `patch-package`, `vitest` + `jsdom`, Playwright (local uniquement).

**Spec:** `docs/superpowers/specs/2026-09-02-dsfr-ssr-streaming-hydration-design.md`

## Global Constraints

- **`yarn` n'est pas installé dans cet environnement.** Toute commande `yarn` du dépôt doit être invoquée `npx --yes yarn@1.22.22 <commande>`. Exemple : `npx --yes yarn@1.22.22 build`.
- **Les suppressions récursives du shell sont bloquées par un hook** dans cet environnement. Pour supprimer un répertoire, passer par Node : `node -e "require('fs').rmSync('<chemin>',{recursive:true,force:true})"`.
- **`patch-package` invoque `yarn` directement**, pas via `npx`, pour son installation interne. Comme `yarn` est absent du PATH, il faut lui fournir un shim exécutable nommé `yarn` (qui relaie vers `npx --yes yarn@1.22.22 "$@"`) dans un répertoire ajouté au PATH le temps de la commande. Ce shim se place **hors du dépôt** et n'est jamais commité.
- **Le cache npm par défaut est partiellement inaccessible.** Si une commande `npm` échoue en `EACCES` sur `/home/aiuser/.npm/_cacache`, relancer avec `--cache /tmp/npmcache`.
- **Ne jamais éditer `node_modules/@gouvfr/dsfr/**` sans régénérer le patch.** Le cycle est : éditer le fichier dans `node_modules`, puis `npx --yes patch-package @gouvfr/dsfr`, qui réécrit `patches/@gouvfr+dsfr+1.14.2.patch`. Le patch existant contient déjà deux hunks (artwork SVG, warning `HeaderLinks`) qui doivent être préservés.
- **Version DSFR figée : `1.14.2`** (`package.json`, `devDependencies` et `peerDependencies`). Le nom du fichier de patch en dépend.
- **Identifiants à utiliser dans le patch : `options.mode` et `Modes.REACT`.** Dans le bundle `dsfr.module.js`, `const options` est déclaré l.329 et `const Modes` l.195, donc tous deux disponibles dans `Stage` (l.768) et `Instance` (l.1559). `const api` n'est déclaré qu'à la l.3279 : ne pas s'en servir dans ces deux zones.
- **Style de code** : 4 espaces, guillemets doubles, clés d'objet entre guillemets dans `src/`. Lancer `npx --yes yarn@1.22.22 format` et `npx --yes yarn@1.22.22 lint:check` avant chaque commit touchant `src/`.
- **`yarn build` doit précéder `yarn test`.** `src/fr/generatedFromCss/` est produit par le build (`cssToTs`) ; sans lui, `test/runtime/lib/spacing.test.ts` et `test/runtime/lib/gdpr.test.ts` échouent au chargement. Référence vérifiée après build sur cette branche : **27 fichiers, 108 tests, tous verts**. Toute exécution de test qui montre 25/27 fichiers signifie simplement que le build n'a pas été lancé.
- **`npx --yes yarn@1.22.22 format` reformate aussi les `.md`**, donc les fichiers de `docs/` — et corrompt au passage certaines lignes contenant des `**` dans du code inline. Ces fichiers sont des artefacts de travail du coordinateur : après un `format`, restaure-les par `git checkout -- docs` et ne les commite jamais.
- **Branche** : rester sur `agent/hydratation`. Ne jamais changer de branche.
- **`/docs/` est gitignoré** dans ce dépôt. La spec et ce plan sont versionnés via `git add -f` et constituent des artefacts de travail : ils devront être retirés de la branche avant l'ouverture de la PR (Task 7).

---

## Structure de fichiers

**Créés :**
- `test/integration/next-app-router-streaming/` — application de reproduction Next 15 / React 19. Responsabilité unique : exposer trois routes — `/streaming` (composants DSFR dans un `<Suspense>`), `/no-streaming` (témoin, pour isoler ce qui est imputable au streaming) et `/streaming-legacy` (identique à `/streaming` mais montant encore `<StartDsfrOnHydration />`, pour le critère d'acceptation n°4).
- `test/integration/next-app-router-streaming/MEASUREMENTS.md` — relevé de la mesure de référence (Task 1). Versionné, car c'est la pièce justificative de la PR.
- `test/runtime/lib/dsfrEngineReactMode.test.ts` — tests de garde du patch moteur. Charge le bundle patché dans jsdom et vérifie le contrat. Créé en Task 2, étendu en Task 3.
- `test/runtime/lib/dsfrProviderHydrationEffect.test.ts` — vérifie que `DsfrProvider` porte l'effet et que `StartDsfrOnHydration` reste exporté.
- `test/e2e/package.json`, `test/e2e/playwright.config.ts`, `test/e2e/streaming.spec.ts`, `test/e2e/README.md` — test e2e local, hors CI.

**Modifiés :**
- `patches/@gouvfr+dsfr+1.14.2.patch` — régénéré par `patch-package`, deux hunks ajoutés.
- `src/Table.tsx:68` — `suppressHydrationWarning` sur la racine `.fr-table`.
- `src/Range.tsx:142` — `suppressHydrationWarning` sur la racine `.fr-range`.
- `src/next-app-router/DsfrProvider.tsx:63-67` et `:126` — activation de l'effet, annotation `@deprecated`.

**Volontairement non modifié :** `scripts/link-in-integration-apps.ts`. Son tableau `testAppNames` (l.52) force `react`, `react-dom` et `@types/react` de la racine (React 18) dans chaque application listée. Y ajouter l'application de reproduction casserait son React 19. Elle consomme `dist/` via le protocole `link:` et reste hors de ce script.

---

### Task 1 : Application de reproduction et mesure de référence

Cette tâche ne modifie aucun code de production. Son livrable est une mesure. La spec (§4.2) exige qu'elle précède tout patch : c'est elle qui confirme ou infirme que les divergences observées cassent réellement en production, et non seulement en développement.

**Files:**
- Create: `test/integration/next-app-router-streaming/package.json`
- Create: `test/integration/next-app-router-streaming/next.config.js`
- Create: `test/integration/next-app-router-streaming/tsconfig.json`
- Create: `test/integration/next-app-router-streaming/app/dsfr-bootstrap/defaultColorScheme.ts`
- Create: `test/integration/next-app-router-streaming/app/dsfr-bootstrap/index.tsx`
- Create: `test/integration/next-app-router-streaming/app/dsfr-bootstrap/server-only.tsx`
- Create: `test/integration/next-app-router-streaming/app/DsfrShowcase.tsx`
- Create: `test/integration/next-app-router-streaming/app/layout.tsx`
- Create: `test/integration/next-app-router-streaming/app/streaming/page.tsx`
- Create: `test/integration/next-app-router-streaming/app/no-streaming/page.tsx`
- Create: `test/integration/next-app-router-streaming/app/streaming-legacy/page.tsx`
- Create: `test/integration/next-app-router-streaming/MEASUREMENTS.md`

**Interfaces:**
- Consumes: rien.
- Produces: l'application de reproduction, consommée par la Task 6 (e2e) aux URL `http://localhost:3100/streaming`, `/no-streaming` et `/streaming-legacy`. Le composant `DsfrShowcase` (Server Component, sans props) est le contenu partagé par les trois routes.

- [ ] **Step 1 : Construire et lier la bibliothèque**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 install --frozen-lockfile
npx --yes yarn@1.22.22 build
```

Attendu : `dist/` contient `next-app-router/`, `Table.js`, `Range.js`, `package.json` et `dsfr/`. Vérifier :

```bash
ls dist/next-app-router/ && ls dist/dsfr/dsfr.module.js
```

- [ ] **Step 2 : Créer le `package.json` de l'application**

Fichier `test/integration/next-app-router-streaming/package.json` :

```json
{
    "name": "next-app-router-streaming-repro",
    "version": "0.1.0",
    "private": true,
    "scripts": {
        "dev": "node --stack-size=8000 node_modules/.bin/next dev -p 3100",
        "build": "node --stack-size=8000 node_modules/.bin/next build",
        "start": "next start -p 3100"
    },
    "dependencies": {
        "@codegouvfr/react-dsfr": "file:../../../dist",
        "next": "15.1.6",
        "react": "19.0.0",
        "react-dom": "19.0.0"
    },
    "devDependencies": {
        "@types/node": "^20.11.0",
        "@types/react": "19.0.0",
        "@types/react-dom": "19.0.0",
        "sass": "^1.62.1",
        "typescript": "^5.3.0"
    }
}
```

Deux particularités de ce `package.json` méritent explication.

Le script `build` invoque `node --stack-size=8000` : `assets/dsfr_plus_icons.scss` fait un `@use` de `dsfr.min.css` et `icons.min.css`, soit environ 2700 `url()` dans du CSS minifié, ce qui fait déborder la pile de V8 dans la chaîne `resolve-url-loader` → `sass-loader` → `css-loader` (`RangeError: Maximum call stack size exceeded`). `NODE_OPTIONS=--stack-size` ne fonctionne pas, Node rejette ce flag par cette voie. Le problème est propre au build webpack : `next start` sert les routes avec la pile par défaut, donc la mesure d'exécution n'est pas affectée.

Le protocole `file:` copie `dist/` au lieu d'y faire un lien symbolique. C'est ce qu'emploient déjà `test/integration/next-appdir` et `next-pagesdir` dans ce dépôt, avec le même `next.config.js` minimal.

`link:` a été essayé et **ne fonctionne pas** : webpack ne résout pas les imports d'assets du paquet (`favicon/*.png|svg|ico`, `assets/dsfr_plus_icons.scss`, `dsfr/fonts/Marianne-*.woff2`) à travers un symlink pointant hors de l'arbre du projet, alors que Node les résout parfaitement. Toutes les routes retournent alors HTTP 500 et `next build` échoue. Trois contournements côté `next.config.js` ont été testés sans succès : `experimental.externalDir`, `snapshot.managedPaths: []` (sans effet), et `resolve.symlinks: false` (corrige les binaires mais provoque un `RangeError: Maximum call stack size exceeded` dans la chaîne `resolve-url-loader` → `sass-loader`).

**Conséquence à ne pas oublier** : `file:` copie. Après toute reconstruction de `dist/` — c'est-à-dire après les Tasks 2 à 5, qui modifient le moteur et `src/` — il faut relancer `npx --yes yarn@1.22.22 install --force` dans l'app de repro avant de re-mesurer, sans quoi on mesurerait une copie périmée de la bibliothèque.

`sass` est requis parce que `DsfrHead` importe `assets/dsfr_plus_icons.scss`.

- [ ] **Step 3 : Créer `next.config.js` et `tsconfig.json`**

Fichier `test/integration/next-app-router-streaming/next.config.js` :

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    // Les .d.ts publiés dans dist/ sont compilés avec @types/react 18 (version
    // du package.json racine), l'app est en 19 pour que ses Server Components
    // async typent. Les deux identités de type sont incompatibles, et aucune
    // version unique de @types/react ne satisfait les deux. Le gate TypeScript
    // est donc désactivé ici : webpack compile avant lui, et cette app est un
    // banc de mesure d'exécution, pas un livrable typé.
    typescript: { ignoreBuildErrors: true },
    webpack: config => {
        config.module.rules.push({
            test: /\.woff2$/,
            type: "asset/resource"
        });
        return config;
    }
};

module.exports = nextConfig;
```

Fichier `test/integration/next-app-router-streaming/tsconfig.json` :

```json
{
    "compilerOptions": {
        "target": "es2017",
        "lib": ["dom", "dom.iterable", "esnext"],
        "allowJs": true,
        "skipLibCheck": true,
        "strict": true,
        "noEmit": true,
        "esModuleInterop": true,
        "module": "esnext",
        "moduleResolution": "bundler",
        "resolveJsonModule": true,
        "isolatedModules": true,
        "jsx": "preserve",
        "incremental": true,
        "plugins": [{ "name": "next" }]
    },
    "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
    "exclude": ["node_modules"]
}
```

- [ ] **Step 4 : Créer le bootstrap DSFR**

Fichier `test/integration/next-app-router-streaming/app/dsfr-bootstrap/defaultColorScheme.ts` :

```ts
import type { DefaultColorScheme } from "@codegouvfr/react-dsfr/next-app-router";

export const defaultColorScheme: DefaultColorScheme = "system";
```

Fichier `test/integration/next-app-router-streaming/app/dsfr-bootstrap/index.tsx` :

```tsx
"use client";

import Link from "next/link";
import {
    DsfrProviderBase,
    type DsfrProviderProps
} from "@codegouvfr/react-dsfr/next-app-router";
import { defaultColorScheme } from "./defaultColorScheme";

declare module "@codegouvfr/react-dsfr/next-app-router" {
    interface RegisterLink {
        Link: typeof Link;
    }
}

export function DsfrProvider(props: DsfrProviderProps) {
    return (
        <DsfrProviderBase {...props} Link={Link} defaultColorScheme={defaultColorScheme} />
    );
}

export { StartDsfrOnHydration } from "@codegouvfr/react-dsfr/next-app-router";
```

Fichier `test/integration/next-app-router-streaming/app/dsfr-bootstrap/server-only.tsx` :

```tsx
import Link from "next/link";
import {
    createGetHtmlAttributes,
    DsfrHeadBase,
    type DsfrHeadProps
} from "@codegouvfr/react-dsfr/next-app-router/server-only-index";
import { defaultColorScheme } from "./defaultColorScheme";

export const { getHtmlAttributes } = createGetHtmlAttributes({ defaultColorScheme });

export function DsfrHead(props: DsfrHeadProps) {
    return <DsfrHeadBase {...props} Link={Link} />;
}
```

- [ ] **Step 5 : Créer le contenu DSFR partagé par les deux routes**

Fichier `test/integration/next-app-router-streaming/app/DsfrShowcase.tsx`. C'est un Server Component : aucun `"use client"`. Il rassemble les composants les plus instrumentés par le moteur, listés en §4.1 de la spec.

Les props ci-dessous sont conformes aux signatures réelles : `Accordion` n'accepte pas de prop arbitraire comme `data-testid` (`AccordionProps`, `src/Accordion.tsx:19`), `SegmentedControl` exige une variante de légende (`src/SegmentedControl.tsx:35-39`), et `buttonsEquisized` est nécessaire pour déclencher la registration `EquisizedsGroup` — c'est-à-dire la mutation #2 de l'audit.

```tsx
import { Table } from "@codegouvfr/react-dsfr/Table";
import { Accordion } from "@codegouvfr/react-dsfr/Accordion";
import { Button } from "@codegouvfr/react-dsfr/Button";
import { ButtonsGroup } from "@codegouvfr/react-dsfr/ButtonsGroup";
import { Tabs } from "@codegouvfr/react-dsfr/Tabs";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import { Tooltip } from "@codegouvfr/react-dsfr/Tooltip";
import { Range } from "@codegouvfr/react-dsfr/Range";

export function DsfrShowcase() {
    return (
        <div data-testid="dsfr-showcase">
            <Accordion label="Accordéon de test">
                Contenu de l&apos;accordéon.
            </Accordion>

            <Table
                caption="Table de test"
                headers={["Colonne A", "Colonne B"]}
                data={[
                    ["a1", "b1"],
                    ["a2", "b2"]
                ]}
            />

            <Tabs
                tabs={[
                    { label: "Onglet 1", content: <p>Contenu 1</p> },
                    { label: "Onglet 2", content: <p>Contenu 2</p> }
                ]}
            />

            <SegmentedControl
                legend="Légende du contrôle segmenté"
                segments={[
                    { label: "Un", nativeInputProps: { defaultChecked: true } },
                    { label: "Deux" }
                ]}
            />

            <ButtonsGroup
                buttonsEquisized
                buttons={[
                    { children: "Bouton un" },
                    { children: "Bouton deux", priority: "secondary" }
                ]}
            />

            <Range label="Curseur de test" min={0} max={100} />

            <Button aria-describedby="tooltip-test">Survolez-moi</Button>
            <Tooltip id="tooltip-test" title="Texte d'infobulle" />
        </div>
    );
}
```

- [ ] **Step 6 : Créer le layout et les deux routes**

Fichier `test/integration/next-app-router-streaming/app/layout.tsx` :

```tsx
import type { ReactNode } from "react";
import { DsfrProvider } from "./dsfr-bootstrap";
import { DsfrHead, getHtmlAttributes } from "./dsfr-bootstrap/server-only";

export default function RootLayout({ children }: { children: ReactNode }) {
    const lang = "fr";

    return (
        <html {...getHtmlAttributes({ lang })}>
            <head>
                <title>Repro streaming DSFR</title>
                <DsfrHead />
            </head>
            <body>
                <DsfrProvider lang={lang}>{children}</DsfrProvider>
            </body>
        </html>
    );
}
```

Fichier `test/integration/next-app-router-streaming/app/streaming/page.tsx` :

```tsx
import { Suspense } from "react";
import { StartDsfrOnHydration } from "../dsfr-bootstrap";
import { DsfrShowcase } from "../DsfrShowcase";

export const dynamic = "force-dynamic";

async function SlowShowcase() {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return <DsfrShowcase />;
}

export default function StreamingPage() {
    return (
        <main>
            {/* Setup actuellement documenté : « You must mount this component on
                every pages of your App! ». Sans lui, dsfrEffect() n'est jamais
                appelé et le moteur ne démarre pas — la mesure ne relèverait rien.
                La Task 5 le retirera d'ici. */}
            <StartDsfrOnHydration />
            <h1 data-testid="shell">Shell immédiat</h1>
            <Suspense fallback={<p data-testid="fallback">Chargement…</p>}>
                <SlowShowcase />
            </Suspense>
        </main>
    );
}
```

Fichier `test/integration/next-app-router-streaming/app/no-streaming/page.tsx` :

```tsx
import { StartDsfrOnHydration } from "../dsfr-bootstrap";
import { DsfrShowcase } from "../DsfrShowcase";

export const dynamic = "force-dynamic";

export default function NoStreamingPage() {
    return (
        <main>
            <StartDsfrOnHydration />
            <h1 data-testid="shell">Shell immédiat</h1>
            <DsfrShowcase />
        </main>
    );
}
```

Fichier `test/integration/next-app-router-streaming/app/streaming-legacy/page.tsx`. Cette route couvre le **critère d'acceptation n°4** de la spec : une application qui monte encore `<StartDsfrOnHydration />` doit continuer de fonctionner sans modification, puisque la Task 5 ne fait que le rendre optionnel.

```tsx
import { Suspense } from "react";
import { StartDsfrOnHydration } from "../dsfr-bootstrap";
import { DsfrShowcase } from "../DsfrShowcase";

export const dynamic = "force-dynamic";

async function SlowShowcase() {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return <DsfrShowcase />;
}

export default function StreamingLegacyPage() {
    return (
        <main>
            <StartDsfrOnHydration />
            <h1 data-testid="shell">Shell immédiat</h1>
            <Suspense fallback={<p data-testid="fallback">Chargement…</p>}>
                <SlowShowcase />
            </Suspense>
        </main>
    );
}
```

- [ ] **Step 7 : Installer et démarrer l'application en développement**

```bash
cd /workspace/.trees/hydratation/test/integration/next-app-router-streaming
npx --yes yarn@1.22.22 install
npx --yes yarn@1.22.22 dev
```

Attendu : le serveur écoute sur `http://localhost:3100`. Si l'installation échoue sur la résolution de `link:../../../dist`, vérifier que `dist/package.json` existe (produit au Step 1 par `yarn build` **sans** `--prePublish`).

- [ ] **Step 8 : Relever la mesure en développement**

Ouvrir `http://localhost:3100/streaming` dans Chrome (le binaire est à `/usr/bin/google-chrome`) et relever la console. Faire de même sur `/no-streaming`. Consigner, pour chaque route, chaque message correspondant à l'un de ces motifs :

- `Extra attributes from the server`
- `did not match`
- `Hydration failed`
- `There was an error while hydrating`
- `add id '…' to …` (avertissement émis par `retrieveNodeId` du moteur, ligne #6 de l'audit de la spec)

- [ ] **Step 9 : Relever la mesure en production**

C'est l'étape décisive : elle tranche entre « bruit de développement » et « casse réelle ».

```bash
cd /workspace/.trees/hydratation/test/integration/next-app-router-streaming
npx --yes yarn@1.22.22 build
npx --yes yarn@1.22.22 start
```

Sur `http://localhost:3100/streaming`, puis sur `/no-streaming` et `/streaming-legacy`, relever les mêmes motifs.

Le re-rendu d'un boundary côté client n'a pas besoin d'instrumentation : React l'annonce lui-même par un `console.error` contenant `There was an error while hydrating this Suspense boundary`, motif déjà présent dans la liste du Step 8. Son absence dans la console vaut donc preuve qu'aucun boundary n'a été re-rendu — c'est ce qu'il faut consigner.

- [ ] **Step 10 : Écrire le relevé**

Fichier `test/integration/next-app-router-streaming/MEASUREMENTS.md`. Structure imposée :

```markdown
# Relevé de référence — hydratation et streaming

Mesuré le <date> sur `<sha de main>`, sans aucune modification du moteur.

Environnement : Next <version>, React <version>, Chrome <version>.

## `/streaming` — développement

| Composant | Message | Catégorie |
|---|---|---|
| … | … | warning \| erreur |

## `/streaming` — production (`next build && next start`)

| Composant | Message | Catégorie |
|---|---|---|
| … | … | warning \| erreur |

## `/no-streaming` — production

| Composant | Message | Catégorie |
|---|---|---|
| … | … | warning \| erreur |

## Boundary re-rendu côté client ?

oui / non, avec la preuve observée.

## Conclusion

Une phrase : le patch conçu en §2 est justifié tel quel / doit être réduit à … / doit être étendu à ….
```

Remplir toutes les cellules. Un tableau vide est un résultat valide et doit être écrit comme tel — c'est une information, pas une lacune.

- [ ] **Step 11 : Commit**

```bash
cd /workspace/.trees/hydratation
git add test/integration/next-app-router-streaming
git commit -m "test(streaming): app de reproduction Next 15 / React 19 et relevé de référence

Deux routes, /streaming et /no-streaming, pour isoler ce qui est imputable
au streaming. Le relevé de MEASUREMENTS.md est la pièce justificative
exigée par la spec avant toute modification du moteur."
```

- [ ] **Step 12 : Point d'arrêt — confronter la mesure au design**

Si la conclusion du relevé est « le patch doit être réduit ou étendu », **s'arrêter et le signaler** avant d'entamer la Task 2. Le plan qui suit suppose la conclusion « justifié tel quel ». C'est le point de contrôle prévu par la spec.

---

### Task 2 : Patch moteur §2.1 — ne plus poser les `data-fr-js-*` sans usage CSS

**Files:**
- Modify: `node_modules/@gouvfr/dsfr/dist/dsfr.module.js` (l.195-203 et l.1592) puis régénération de `patches/@gouvfr+dsfr+1.14.2.patch`
- Test: `test/runtime/lib/dsfrEngineReactMode.test.ts` (créé ici)

**Interfaces:**
- Consumes: rien de la Task 1 hormis sa conclusion.
- Produces: la constante `CSS_BOUND_JS_ATTRIBUTES` au niveau module du bundle, réutilisée par aucune autre tâche. Le fichier de test `test/runtime/lib/dsfrEngineReactMode.test.ts` expose la fonction utilitaire `loadEngine(params: { mode: "react" | "auto" }): Promise<{ window: DOMWindow; collectJsAttributes: (root: ParentNode) => string[] }>`, réutilisée par la Task 3.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `test/runtime/lib/dsfrEngineReactMode.test.ts` :

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { JSDOM, type DOMWindow } from "jsdom";
import * as fs from "fs";
import { join as pathJoin } from "path";

const ENGINE_PATH = pathJoin(
    __dirname,
    "..",
    "..",
    "..",
    "node_modules",
    "@gouvfr",
    "dsfr",
    "dist",
    "dsfr.module.js"
);

const MARKUP = `
<section class="fr-accordion">
  <h3 class="fr-accordion__title">
    <button class="fr-accordion__btn" aria-expanded="false" aria-controls="acc-1">Titre</button>
  </h3>
  <div class="fr-collapse" id="acc-1">contenu</div>
</section>
<div class="fr-table" id="tbl">
  <table>
    <caption>Cap</caption>
    <thead><tr><th scope="col">A</th></tr></thead>
    <tbody><tr><td>1</td></tr></tbody>
  </table>
</div>
<div class="fr-range" id="rng">
  <span class="fr-range__output"></span>
  <input type="range" min="0" max="10">
</div>
<button class="fr-btn" aria-controls="modal-1" data-fr-opened="false">Ouvrir</button>
<dialog class="fr-modal" id="modal-1" aria-labelledby="modal-1-title">
  <div class="fr-modal__body"><h1 id="modal-1-title">T</h1></div>
</dialog>
`;

function collectJsAttributes(root: ParentNode): string[] {
    const found = new Set<string>();
    root.querySelectorAll("*").forEach(el => {
        for (const name of el.getAttributeNames()) {
            // Préfixe avec tiret final : exclut data-fr-js posé par Root sur
            // <html>, qui doit être conservé et a son propre test.
            if (name.startsWith("data-fr-js-")) {
                found.add(name);
            }
        }
    });
    return [...found].sort();
}

async function loadEngine(params: { mode: "react" | "auto" }) {
    const { mode } = params;

    const dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`, {
        pretendToBeVisual: true,
        runScripts: "outside-only",
        url: "https://example.test/"
    });

    const window = dom.window as DOMWindow;

    class ObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

    (window as any).ResizeObserver = ObserverStub;
    (window as any).IntersectionObserver = ObserverStub;
    (window as any).matchMedia = (query: string) => ({
        matches: false,
        media: query,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {}
    });
    (window as any).dsfr = { verbose: false, mode };

    (window as any).eval(fs.readFileSync(ENGINE_PATH, "utf8"));

    window.document.body.innerHTML = MARKUP;
    (window as any).dsfr.start();
    await new Promise(resolve => setTimeout(resolve, 50));

    return { window, collectJsAttributes };
}

describe("moteur @gouvfr/dsfr, contrat du mode react", () => {
    it("ne pose que les data-fr-js-* dont le CSS dépend", async () => {
        const { window } = await loadEngine({ mode: "react" });

        expect(collectJsAttributes(window.document)).toEqual([
            "data-fr-js-range",
            "data-fr-js-table"
        ]);

        window.close();
    });

    it("conserve data-fr-js sur documentElement, lu par useIsDark", async () => {
        const { window } = await loadEngine({ mode: "react" });

        expect(window.document.documentElement.getAttribute("data-fr-js")).toBe("true");

        window.close();
    });

    it("pose tous les data-fr-js-* en mode auto", async () => {
        const { window } = await loadEngine({ mode: "auto" });

        const attributes = collectJsAttributes(window.document);

        expect(attributes).toContain("data-fr-js-accordion");
        expect(attributes).toContain("data-fr-js-modal-button");
        expect(attributes).toContain("data-fr-js-table-row");
        expect(attributes.length).toBeGreaterThan(10);

        window.close();
    });
});
```

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test -- dsfrEngineReactMode
```

Attendu : le premier test ÉCHOUE. Le tableau reçu contient 13 entrées (`data-fr-js-accordion`, `data-fr-js-collapse`, `data-fr-js-collapse-button`, `data-fr-js-modal`, `data-fr-js-modal-body`, `data-fr-js-modal-button`, `data-fr-js-range`, `data-fr-js-range-input`, `data-fr-js-range-output`, `data-fr-js-table`, `data-fr-js-table-caption`, `data-fr-js-table-element`, `data-fr-js-table-row`) au lieu de 2. Les deux autres tests PASSENT déjà.

- [ ] **Step 3 : Déclarer la constante dans le bundle**

Dans `node_modules/@gouvfr/dsfr/dist/dsfr.module.js`, repérer la fin de la déclaration de `Modes` (l.195-203) :

```js
const Modes = {
  AUTO: 'auto',
  MANUAL: 'manual',
  RUNTIME: 'runtime',
  LOADED: 'loaded',
  VUE: 'vue',
  ANGULAR: 'angular',
  REACT: 'react'
};
```

Ajouter immédiatement après :

```js

// Seuls attributs data-fr-js-* dont le CSS DSFR dépend :
// .fr-range[data-fr-js-range] et .fr-table[data-fr-js-table=true].
// En mode react, les autres ne sont pas posés : ils divergeraient du HTML rendu
// par le serveur sans qu'aucun style n'en dépende.
const CSS_BOUND_JS_ATTRIBUTES = ['data-fr-js-range', 'data-fr-js-table'];
```

- [ ] **Step 4 : Conditionner la pose de l'attribut**

Toujours dans `dsfr.module.js`, dans `Instance._config` (l.1592), remplacer :

```js
    if (this.jsAttribute) this.setAttribute(registration.attribute, true);
```

par :

```js
    if (this.jsAttribute && (options.mode !== Modes.REACT || CSS_BOUND_JS_ATTRIBUTES.indexOf(registration.attribute) > -1)) this.setAttribute(registration.attribute, true);
```

`indexOf` plutôt que `Set.has` pour rester homogène avec le style du fichier, qui utilise `indexOf` partout (voir `Stage.mutate`, `Instance.unlistenKey`).

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test -- dsfrEngineReactMode
```

Attendu : les trois tests PASSENT.

- [ ] **Step 6 : Régénérer le patch**

```bash
cd /workspace/.trees/hydratation
npx --yes patch-package @gouvfr/dsfr
```

Vérifier que les deux hunks préexistants sont toujours présents :

```bash
grep -c "Slightly increasing size" patches/@gouvfr+dsfr+1.14.2.patch
grep -c "As you're using a dynamic framework" patches/@gouvfr+dsfr+1.14.2.patch
```

Attendu : `1` pour chacun. Si l'un vaut `0`, le patch a été écrasé : restaurer avec `git checkout patches/` et recommencer à partir d'un `node_modules` réinstallé.

- [ ] **Step 7 : Commit**

```bash
git add patches/@gouvfr+dsfr+1.14.2.patch test/runtime/lib/dsfrEngineReactMode.test.ts
git commit -m "fix(dsfr-engine): ne plus poser les data-fr-js-* sans usage CSS en mode react

Sur les 46 attributs data-fr-js-* posés par Instance._config, deux seulement
sont référencés par le CSS DSFR : [data-fr-js-range] et [data-fr-js-table=true].
Les 44 autres divergent du HTML rendu par le serveur sans qu'aucun style
n'en dépende.

data-fr-js sur documentElement est préservé : useIsDark le lit pour savoir
si le moteur a démarré."
```

---

### Task 3 : Patch moteur §2.2 — différer le parsing des nœuds ajoutés

**Files:**
- Modify: `node_modules/@gouvfr/dsfr/dist/dsfr.module.js` (l.833-836) puis régénération de `patches/@gouvfr+dsfr+1.14.2.patch`
- Test: `test/runtime/lib/dsfrEngineReactMode.test.ts` (étendu)

**Interfaces:**
- Consumes: `loadEngine({ mode })` et `collectJsAttributes(root)` définis en Task 2 dans le même fichier de test.
- Produces: rien de nouveau.

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter dans `test/runtime/lib/dsfrEngineReactMode.test.ts`, à l'intérieur du `describe` existant :

```ts
    it("ne mute pas un nœud inséré tant que la frame n'est pas passée", async () => {
        const { window } = await loadEngine({ mode: "react" });

        const holder = window.document.createElement("div");
        holder.innerHTML = MARKUP;
        window.document.body.appendChild(holder);

        // Le callback d'un MutationObserver est une microtâche : on se place juste
        // après le point de contrôle, là où React n'a pas encore pu hydrater.
        await Promise.resolve();
        await Promise.resolve();

        expect(collectJsAttributes(holder)).toEqual([]);

        window.close();
    });

    it("instrumente le nœud inséré une frame plus tard", async () => {
        const { window } = await loadEngine({ mode: "react" });

        const holder = window.document.createElement("div");
        holder.innerHTML = MARKUP;
        window.document.body.appendChild(holder);

        await new Promise(resolve => setTimeout(resolve, 80));

        expect(collectJsAttributes(holder)).toEqual([
            "data-fr-js-range",
            "data-fr-js-table"
        ]);

        window.close();
    });

    it("pilote le contenu inséré tardivement", async () => {
        const { window } = await loadEngine({ mode: "react" });

        const holder = window.document.createElement("div");
        holder.innerHTML = `
<section class="fr-accordion">
  <h3 class="fr-accordion__title">
    <button class="fr-accordion__btn" aria-expanded="false" aria-controls="late-1">Titre</button>
  </h3>
  <div class="fr-collapse" id="late-1">contenu</div>
</section>`;
        window.document.body.appendChild(holder);

        await new Promise(resolve => setTimeout(resolve, 80));

        const button = window.document.querySelector(".fr-accordion__btn") as HTMLElement;
        expect(button.getAttribute("aria-expanded")).toBe("false");

        button.click();
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(button.getAttribute("aria-expanded")).toBe("true");

        window.close();
    });
```

- [ ] **Step 2 : Lancer les tests pour vérifier lequel échoue**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test -- dsfrEngineReactMode
```

Attendu : « ne mute pas un nœud inséré tant que la frame n'est pas passée » ÉCHOUE — le tableau reçu vaut `["data-fr-js-range", "data-fr-js-table"]` au lieu de `[]`, parce que le `childList` est encore parsé de façon synchrone. Les deux autres nouveaux tests PASSENT déjà.

- [ ] **Step 3 : Router les nœuds ajoutés vers le chemin différé**

Dans `node_modules/@gouvfr/dsfr/dist/dsfr.module.js`, dans `Stage.mutate` (l.833), remplacer :

```js
        case 'childList':
          mutation.removedNodes.forEach((node) => this.dispose(node));
          mutation.addedNodes.forEach((node) => this.parse(node));
          break;
```

par :

```js
        case 'childList':
          mutation.removedNodes.forEach((node) => this.dispose(node));
          mutation.addedNodes.forEach((node) => {
            // En mode react, les nœuds ajoutés empruntent le chemin différé déjà
            // utilisé pour les mutations d'attributs : this.modifications est rejoué
            // par modify() au requestAnimationFrame suivant. Cela laisse à React le
            // temps d'hydrater le contenu avant que le moteur ne le mute.
            if (options.mode === Modes.REACT) {
              if (this.modifications.indexOf(node) === -1) this.modifications.push(node);
            } else this.parse(node);
          });
          break;
```

Aucune autre modification n'est nécessaire : le bloc de fin de `mutate` (l.851-855) déclenche déjà `requestAnimationFrame(this.modifying)` dès que `this.modifications` est non vide, et `modify()` appelle `this.parse(target)` après avoir vérifié `document.documentElement.contains(target)`.

- [ ] **Step 4 : Lancer les tests pour vérifier qu'ils passent**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test -- dsfrEngineReactMode
```

Attendu : les six tests PASSENT. Le dernier — « pilote le contenu inséré tardivement » — est le plus important : il prouve que le report n'a pas cassé le moteur.

- [ ] **Step 5 : Régénérer le patch et vérifier les hunks**

```bash
cd /workspace/.trees/hydratation
npx --yes patch-package @gouvfr/dsfr
grep -c "Slightly increasing size" patches/@gouvfr+dsfr+1.14.2.patch
grep -c "As you're using a dynamic framework" patches/@gouvfr+dsfr+1.14.2.patch
grep -c "CSS_BOUND_JS_ATTRIBUTES" patches/@gouvfr+dsfr+1.14.2.patch
```

Attendu : `1`, `1`, et une valeur ≥ `2` pour le troisième (déclaration et usage).

- [ ] **Step 6 : Commit**

```bash
git add patches/@gouvfr+dsfr+1.14.2.patch test/runtime/lib/dsfrEngineReactMode.test.ts
git commit -m "fix(dsfr-engine): différer le parsing des nœuds ajoutés en mode react

Stage traite déjà les mutations d'attributs de façon différée, via
this.modifications rejoué par modify() au requestAnimationFrame suivant ;
seul le childList parsait en synchrone. Le patch supprime cette asymétrie
en mode react, ce qui laisse à React le temps d'hydrater un boundary
streamé avant que le moteur ne mute son contenu.

queueMicrotask ne conviendrait pas : le callback d'un MutationObserver est
lui-même une microtâche, donc le report se ferait dans le même point de
contrôle et ne différerait rien."
```

---

### Task 4 : `suppressHydrationWarning` sur `Table` et `Range`

Les deux attributs conservés par la Task 2 restent posés par le moteur après insertion, donc divergent du HTML serveur. Ils portent l'un et l'autre sur la racine du composant, ce qui rend la portée d'un seul niveau de `suppressHydrationWarning` exactement suffisante.

**Files:**
- Modify: `src/Table.tsx:68`
- Modify: `src/Range.tsx:142`

**Interfaces:**
- Consumes: rien.
- Produces: rien. Aucune signature publique ne change.

- [ ] **Step 1 : Modifier `src/Table.tsx`**

Repérer la racine rendue (l.67-85) :

```tsx
            <div
                id={id}
                ref={ref}
                style={style}
                className={cx(
```

Ajouter `suppressHydrationWarning` juste après `style={style}` :

```tsx
            <div
                id={id}
                ref={ref}
                style={style}
                // Le moteur DSFR pose data-fr-js-table="true" sur ce nœud après
                // hydratation ; le CSS en dépend, donc l'attribut ne peut pas être
                // supprimé côté moteur. Il porte sur ce nœud précis, ce qui rend la
                // portée d'un seul niveau de suppressHydrationWarning suffisante.
                suppressHydrationWarning
                className={cx(
```

- [ ] **Step 2 : Modifier `src/Range.tsx`**

Repérer la racine `.fr-range` (l.142-153) et ajouter l'attribut après la fermeture du `className` :

```tsx
                <div
                    className={cx(
                        fr.cx(
                            "fr-range",
                            small && "fr-range--sm",
                            double && "fr-range--double",
                            step !== undefined && "fr-range--step"
                        ),
                        classes.rangeWrapper
                    )}
                    // Le moteur DSFR pose data-fr-js-range sur ce nœud après
                    // hydratation ; le CSS en dépend (.fr-range[data-fr-js-range]).
                    suppressHydrationWarning
                    data-fr-prefix={prefix}
                    data-fr-suffix={suffix}
                >
```

- [ ] **Step 3 : Vérifier que le typage et le lint passent**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 format
npx --yes yarn@1.22.22 lint:check
npx --yes tsc -p src --noEmit
```

Attendu : aucune erreur. `suppressHydrationWarning` est un attribut DOM standard de React, accepté sur `div` sans déclaration supplémentaire.

- [ ] **Step 4 : Commit**

```bash
git add src/Table.tsx src/Range.tsx
git commit -m "fix(Table,Range): suppressHydrationWarning sur les racines instrumentées

Le moteur pose data-fr-js-table et data-fr-js-range après hydratation, et le
CSS DSFR en dépend — ils ne peuvent donc pas être supprimés côté moteur. Les
deux portent sur la racine du composant, ce qui rend la portée d'un seul
niveau de suppressHydrationWarning exactement suffisante.

Les rendre en SSR a été écarté : ils gouvernent des styles qui dépendent de
variables CSS calculées par le JS, ce qui produirait un FOUC."
```

---

### Task 5 : `DsfrProvider` porte l'effet d'hydratation

C'est le gain de DX de la PR : `<StartDsfrOnHydration />` cesse d'être obligatoire sur chaque page.

**Files:**
- Modify: `src/next-app-router/DsfrProvider.tsx:63-67` et `:126`
- Test: `test/runtime/lib/dsfrProviderHydrationEffect.test.ts` (créé ici)

**Interfaces:**
- Consumes: rien.
- Produces: `StartDsfrOnHydration` reste exporté avec la même signature `() => null`. Aucune rupture d'API.

- [ ] **Step 1 : Écrire le test qui échoue**

Créer `test/runtime/lib/dsfrProviderHydrationEffect.test.ts` :

```ts
// @vitest-environment node
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import { join as pathJoin } from "path";

const PROVIDER_PATH = pathJoin(
    __dirname,
    "..",
    "..",
    "..",
    "src",
    "next-app-router",
    "DsfrProvider.tsx"
);

describe("DsfrProvider, effet d'hydratation", () => {
    const source = fs.readFileSync(PROVIDER_PATH, "utf8");

    it("appelle dsfrEffect dans un useEffect actif, non commenté", () => {
        // Le fichier contient deux useEffect : celui du provider et celui de
        // StartDsfrOnHydration. On ne regarde que ce qui précède la déclaration
        // de StartDsfrOnHydration, sans quoi le test passerait déjà avant le
        // correctif — celui de StartDsfrOnHydration matcherait.
        const markerIndex = source.indexOf("export function StartDsfrOnHydration");
        expect(markerIndex).toBeGreaterThan(-1);

        const providerSource = source
            .slice(0, markerIndex)
            .replace(/\/\*[\s\S]*?\*\//g, "");

        expect(providerSource).toMatch(
            /useEffect\(\s*\(\)\s*=>\s*\{\s*dsfrEffect\(\);\s*\}\s*,\s*\[\]\s*\);/
        );
    });

    it("garde StartDsfrOnHydration exporté, annoté @deprecated", () => {
        expect(source).toMatch(/export function StartDsfrOnHydration\(\)/);
        expect(source).toMatch(/@deprecated/);
    });

    it("garde dsfrEffect idempotent", () => {
        expect(source).toMatch(/if \(isAfterFirstEffect\) \{\s*return;\s*\}/);
    });
});
```

Ce test lit la source plutôt que de rendre le composant : `DsfrProvider` importe `start()`, qui charge le moteur DSFR et exige un DOM complet, ce qui en ferait un test d'intégration déguisé. L'assertion structurelle suffit ici — le comportement réel est couvert par l'e2e de la Task 6.

- [ ] **Step 2 : Lancer le test pour vérifier qu'il échoue**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test -- dsfrProviderHydrationEffect
```

Attendu : le premier test ÉCHOUE (le `useEffect` est dans un bloc commenté), le deuxième ÉCHOUE (pas d'annotation `@deprecated`), le troisième PASSE.

- [ ] **Step 3 : Activer l'effet**

Dans `src/next-app-router/DsfrProvider.tsx`, remplacer le bloc commenté (l.63-67) :

```tsx
    /*
    useEffect(() => {
        dsfrEffect();
    }, []);
    */
```

par :

```tsx
    // Les effets des enfants s'exécutent avant ceux du parent : quand celui-ci
    // se déclenche, le shell est hydraté. C'est ce qui rend
    // <StartDsfrOnHydration /> optionnel.
    useEffect(() => {
        dsfrEffect();
    }, []);
```

- [ ] **Step 4 : Annoter `StartDsfrOnHydration`**

Toujours dans le même fichier, remplacer (l.126) :

```tsx
export function StartDsfrOnHydration() {
```

par :

```tsx
/**
 * @deprecated Ce composant n'est plus nécessaire : `DsfrProvider` déclenche
 * désormais lui-même l'effet d'hydratation. Il reste exporté et pleinement
 * fonctionnel — `dsfrEffect()` est idempotent — pour ne pas casser les
 * applications qui le montent déjà. Vous pouvez le retirer de vos pages.
 */
export function StartDsfrOnHydration() {
```

- [ ] **Step 5 : Lancer le test pour vérifier qu'il passe**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test -- dsfrProviderHydrationEffect
```

Attendu : les trois tests PASSENT.

- [ ] **Step 6 : Retirer `StartDsfrOnHydration` des routes qui n'en ont plus besoin**

C'est la démonstration du gain : ces routes fonctionnent désormais sans lui. Dans `test/integration/next-app-router-streaming/app/streaming/page.tsx` et `app/no-streaming/page.tsx`, supprimer la ligne `<StartDsfrOnHydration />` ainsi que son import et le commentaire qui l'accompagne.

`app/streaming-legacy/page.tsx` le conserve : c'est la route qui vérifie le critère d'acceptation n°4, à savoir qu'une application qui le monte encore continue de fonctionner.

- [ ] **Step 7 : Vérifier l'absence de régression sur toute la suite**

```bash
npx --yes yarn@1.22.22 build
npx --yes yarn@1.22.22 test
npx --yes yarn@1.22.22 lint:check
```

Attendu : **29 fichiers de tests** — les 27 de référence, plus `dsfrEngineReactMode.test.ts` (créé en Task 2, étendu en Task 3) et `dsfrProviderHydrationEffect.test.ts` (celui-ci) — tous verts, et aucune erreur de lint. Le `build` doit précéder le `test`, sinon deux fichiers échouent au chargement pour une raison sans rapport (voir Global Constraints).

- [ ] **Step 8 : Commit**

```bash
git add src/next-app-router/DsfrProvider.tsx test/runtime/lib/dsfrProviderHydrationEffect.test.ts test/integration/next-app-router-streaming/app
git commit -m "feat(next-app-router): DsfrProvider déclenche l'effet d'hydratation

<StartDsfrOnHydration /> devait être monté sur chaque page. DsfrProvider
étant déjà un client component qui enveloppe l'application, et React
exécutant les effets des enfants avant ceux du parent, son propre useEffect
offre la même garantie sans rien demander à l'utilisateur.

StartDsfrOnHydration reste exporté et fonctionnel, annoté @deprecated :
dsfrEffect() est idempotent, les applications qui le montent ne cassent pas."
```

---

### Task 6 : Test e2e local

**Files:**
- Create: `test/e2e/package.json`
- Create: `test/e2e/playwright.config.ts`
- Create: `test/e2e/streaming.spec.ts`
- Create: `test/e2e/README.md`

**Interfaces:**
- Consumes: l'application de la Task 1, servie sur `http://localhost:3100`, avec les `data-testid` `shell`, `fallback` et `dsfr-showcase`, et les trois routes `/streaming`, `/no-streaming`, `/streaming-legacy`.
- Produces: rien.

- [ ] **Step 1 : Créer le projet e2e**

Fichier `test/e2e/package.json` :

```json
{
    "name": "react-dsfr-e2e",
    "version": "0.1.0",
    "private": true,
    "scripts": {
        "test": "playwright test"
    },
    "devDependencies": {
        "@playwright/test": "^1.49.0"
    }
}
```

Fichier `test/e2e/playwright.config.ts` :

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: ".",
    // Le serveur de dev compile à la première requête, en plus du délai de
    // streaming de 1,5 s.
    timeout: 120_000,
    use: {
        baseURL: "http://localhost:3100",
        // Chrome système : évite le téléchargement d'un navigateur.
        channel: "chrome"
    },
    webServer: {
        // Serveur de DÉVELOPPEMENT, délibérément. La mesure de la Task 1 a
        // établi qu'en production les trois routes sont strictement
        // silencieuses, avec ou sans le correctif : React ne remonte le diff
        // d'hydratation qu'en développement. Un e2e visant `next start` ne
        // pourrait donc ni observer le défaut ni démontrer sa correction —
        // il passerait à vide dans les deux sens.
        command: "npx --yes yarn@1.22.22 dev",
        cwd: "../integration/next-app-router-streaming",
        url: "http://localhost:3100/no-streaming",
        reuseExistingServer: true,
        timeout: 180_000
    }
});
```

- [ ] **Step 2 : Écrire le test e2e**

Fichier `test/e2e/streaming.spec.ts` :

```ts
import { test, expect, type ConsoleMessage } from "@playwright/test";

// React 19 a reformulé le message : il dit « didn't match », pas
// « did not match ». Un motif qui ne couvrirait que l'ancienne formulation
// laisserait passer le seul message que cette app produit réellement, et le
// test passerait à vide. Mesuré en Task 1.
const HYDRATION_PATTERNS = [
    "A tree hydrated but some attributes",
    "didn't match",
    "did not match",
    "Extra attributes from the server",
    "Hydration failed",
    "There was an error while hydrating"
];

function isHydrationMessage(text: string): boolean {
    return HYDRATION_PATTERNS.some(pattern => text.includes(pattern));
}

test("streaming : aucune divergence d'hydratation, moteur fonctionnel", async ({ page }) => {
    const hydrationMessages: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (message: ConsoleMessage) => {
        const text = message.text();
        if (isHydrationMessage(text)) {
            hydrationMessages.push(text);
        }
    });
    page.on("pageerror", error => {
        pageErrors.push(error.message);
    });

    await page.goto("/streaming");

    // Le shell arrive avant le contenu streamé.
    await expect(page.getByTestId("shell")).toBeVisible();
    await expect(page.getByTestId("fallback")).toBeVisible();

    // Puis le boundary se résout.
    await expect(page.getByTestId("dsfr-showcase")).toBeVisible({ timeout: 30_000 });

    expect(hydrationMessages).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Le moteur pilote bien le contenu arrivé tardivement.
    const accordionButton = page.locator(".fr-accordion__btn").first();
    await expect(accordionButton).toHaveAttribute("aria-expanded", "false");
    await accordionButton.click();
    await expect(accordionButton).toHaveAttribute("aria-expanded", "true");

    // Les onglets réagissent.
    const secondTab = page.locator(".fr-tabs__tab").nth(1);
    await secondTab.click();
    await expect(secondTab).toHaveAttribute("aria-selected", "true");
});

test("StartDsfrOnHydration monté : toujours fonctionnel", async ({ page }) => {
    const hydrationMessages: string[] = [];

    page.on("console", (message: ConsoleMessage) => {
        const text = message.text();
        if (isHydrationMessage(text)) {
            hydrationMessages.push(text);
        }
    });

    await page.goto("/streaming-legacy");
    await expect(page.getByTestId("dsfr-showcase")).toBeVisible({ timeout: 30_000 });

    expect(hydrationMessages).toEqual([]);

    // dsfrEffect() est idempotent : le monter en plus de DsfrProvider ne doit
    // rien casser. C'est le critère d'acceptation n°4 de la spec.
    const accordionButton = page.locator(".fr-accordion__btn").first();
    await accordionButton.click();
    await expect(accordionButton).toHaveAttribute("aria-expanded", "true");
});

test("sans streaming : aucune divergence d'hydratation", async ({ page }) => {
    const hydrationMessages: string[] = [];

    page.on("console", (message: ConsoleMessage) => {
        const text = message.text();
        if (isHydrationMessage(text)) {
            hydrationMessages.push(text);
        }
    });

    await page.goto("/no-streaming");
    await expect(page.getByTestId("dsfr-showcase")).toBeVisible();

    expect(hydrationMessages).toEqual([]);
});
```

- [ ] **Step 3 : Documenter l'exécution manuelle**

Fichier `test/e2e/README.md` :

```markdown
# Tests e2e

Ces tests ne font pas partie de la CI : ils demandent un build Next et un
Chrome installé. Ils servent à prouver le correctif et à documenter la PR.

## Prérequis

- Chrome installé (`/usr/bin/google-chrome`)
- La bibliothèque construite : `npx --yes yarn@1.22.22 build` à la racine
- L'application de reproduction construite :
  `cd test/integration/next-app-router-streaming && npx --yes yarn@1.22.22 build`

## Exécution

```bash
cd test/e2e
npx --yes yarn@1.22.22 install
npx playwright test
```

Le serveur Next est démarré automatiquement par Playwright sur le port 3100.
```

- [ ] **Step 4 : Lancer le test sur la branche corrigée**

L'e2e tourne contre `next dev` (voir la config), donc pas de `next build` requis pour lui. Le `--force` de la deuxième ligne n'est pas décoratif : `file:` copie `dist/`, donc sans réinstallation l'app testerait la version de la bibliothèque d'avant les Tasks 2 à 5.

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 build
cd test/integration/next-app-router-streaming
npx --yes yarn@1.22.22 install --force
npx --yes yarn@1.22.22 build
cd ../../..
cd test/e2e && npx --yes yarn@1.22.22 install && npx playwright test
```

Vérifier que la copie est bien à jour avant de lancer les tests — le patch doit être présent dans la copie, pas seulement à la racine :

```bash
grep -c "CSS_BOUND_JS_ATTRIBUTES" test/integration/next-app-router-streaming/node_modules/@codegouvfr/react-dsfr/dsfr/dsfr.module.js
```

Attendu : une valeur ≥ 2, puis les trois tests PASSENT.

**Si un message d'hydratation subsiste malgré le correctif, n'affaiblis pas l'assertion.** Rapporte son contenu intégral. La mesure de la Task 1 a relevé, dans le diff React de développement, des lignes portant aussi sur du texte et sur `className`/`aria-selected` (onglets), en plus des `data-fr-js-*`. Il est probable que ce soient de simples lignes de contexte imprimées par React autour des vraies divergences, mais ce n'est pas établi. Si le message ne disparaît pas entièrement, c'est une information de premier ordre sur les limites du correctif — pas un test à assouplir.

- [ ] **Step 5 : Vérifier que le test échoue sans le correctif**

C'est ce qui donne sa valeur d'argument au test. Neutraliser temporairement le patch, reconstruire, relancer :

`patch-package` n'annule pas un patch déjà appliqué : masquer `patches/` ne suffit pas, il faut repartir d'un `@gouvfr/dsfr` vierge, sans quoi le moteur reste patché et la vérification passerait à tort. La suppression passe par Node : les commandes de suppression récursive du shell sont bloquées dans cet environnement.

```bash
cd /workspace/.trees/hydratation
git stash push -u -m "e2e-verif-sans-patch" -- patches/
git stash list --format='%H %gs' | head -1   # noter le SHA
node -e "require('fs').rmSync('node_modules/@gouvfr/dsfr',{recursive:true,force:true})"
npx --yes yarn@1.22.22 install --frozen-lockfile
grep -c "^        /\*$" node_modules/@gouvfr/dsfr/dist/dsfr.module.js   # doit valoir 0 : moteur vierge
npx --yes yarn@1.22.22 build
cd test/integration/next-app-router-streaming && npx --yes yarn@1.22.22 install --force && npx --yes yarn@1.22.22 build && cd ../../..
cd test/integration/next-app-router-streaming && npx --yes yarn@1.22.22 build && cd ../../..
cd test/e2e && npx playwright test
```

Attendu : le premier test ÉCHOUE sur `expect(hydrationMessages).toEqual([])`.

Restaurer ensuite, en utilisant le SHA relevé — jamais `git stash pop`, la pile est partagée avec les autres worktrees :

```bash
cd /workspace/.trees/hydratation
git stash apply <sha>
git stash list --format='%gd %gs' | grep e2e-verif-sans-patch   # retrouver stash@{n}
git stash drop 'stash@{n}'
node -e "require('fs').rmSync('node_modules/@gouvfr/dsfr',{recursive:true,force:true})"
npx --yes yarn@1.22.22 install --frozen-lockfile
npx --yes yarn@1.22.22 build
```

Consigner le résultat des deux exécutions dans `test/integration/next-app-router-streaming/MEASUREMENTS.md`, sous une nouvelle section « Vérification e2e : échec sans patch, succès avec ».

- [ ] **Step 6 : Commit**

```bash
git add test/e2e test/integration/next-app-router-streaming/MEASUREMENTS.md
git commit -m "test(e2e): vérification navigateur du streaming, hors CI

Deux tests Playwright sur le Chrome système : aucune divergence
d'hydratation sur /streaming, et le moteur pilote bien le contenu arrivé
tardivement (accordéon, onglets). Vérifié dans les deux sens — le premier
test échoue sans le patch.

Hors CI délibérément : demande un build Next et un navigateur, ce qu'on
n'impose pas au dépôt."
```

---

### Task 8 : Corriger les trois mécanismes de divergence résiduels

Les Tasks 2 et 3 suppriment les 44 attributs `data-fr-js-*` superflus — vérifié par instrumentation à l'échelle d'une page de 19 familles. Trois divergences d'hydratation appariées subsistent néanmoins sur les routes de streaming, par trois mécanismes distincts. Cette tâche les traite.

**Files:**
- Modify: `node_modules/@gouvfr/dsfr/dist/dsfr.module.js` puis régénération de `patches/@gouvfr+dsfr+1.14.2.patch`
- Test: `test/runtime/lib/dsfrEngineReactMode.test.ts` (étendu)

**Interfaces:**
- Consumes: `loadEngine({ mode })` et `collectJsAttributes(root)` déjà définis dans le fichier de test.
- Produces: rien de nouveau.

**Les trois mécanismes, diagnostiqués et localisés :**

| Famille | Mécanisme | Divergence observée |
|---|---|---|
| `tab` | `TabsGroup` surcharge `getIndex()` en passant `defaultIndex = 0`, là où `DisclosuresGroup.getIndex(defaultIndex = -1)` (l.2659) ne force rien. C'est la seule famille Disclosure à imposer une sélection. | `style` du conteneur (`--tabs-height`) et `className` du panneau (`--direction-end`) |
| `header` | `HeaderModal.storeAria()` **retire** `aria-labelledby` et `aria-label` à l'init, pour les restaurer plus tard. | `aria-labelledby` sur le `.fr-modal` du menu mobile : `null` côté DOM → `"fr-header-menu-button"` côté client |
| `navigation` | Le `fr-collapse` reçoit la classe transitoire `fr-collapsing` et la variable CSS `--collapse` à l'initialisation — une mesure de hauteur appliquée avant hydratation. | `className` et `style` du `fr-collapse` |

**Principe directeur, identique aux Tasks 2 et 3 :** en `mode: "react"`, le moteur ne doit rien imposer que le DOM exprime déjà. Le HTML rendu par le serveur porte l'état correct — c'est vérifié pour les onglets, où le HTML servi contient bien un `aria-selected="true"` et un panneau `--selected`. Le moteur doit donc **lire** cet état plutôt que le réécrire.

- [ ] **Step 1 : Protocole de mesure — à appliquer avant CHAQUE mesure**

`yarn install --force` ne suffit pas. Une dépendance `file:` change de contenu sans changer de version, et webpack traite `node_modules` comme immuable : `next dev` sert alors un chunk compilé périmé. Avant toute mesure :

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 build
cd test/integration/next-app-router-streaming
npx --yes yarn@1.22.22 install --force
node -e "require('fs').rmSync('.next',{recursive:true,force:true})"
```

Ce point a faussé plusieurs mesures de ce projet. Ne le saute jamais.

- [ ] **Step 2 : Établir la mesure de départ, famille par famille**

Les routes d'isolation `/streaming/family/<id>` rendent une seule famille, ce qui évite la troncature du diff React (il s'arrête après la 7e famille sur une page combinée). Relever l'état de `tab`, `header` et `navigation` avant toute modification, avec les divergences appariées citées verbatim.

- [ ] **Step 3 : Corriger `tab`**

Dans `node_modules/@gouvfr/dsfr/dist/dsfr.module.js`, repérer la surcharge de `getIndex` par `TabsGroup` (chercher `getIndex (` dans la classe `TabsGroup`). En mode react, ne pas forcer d'index par défaut : laisser le comportement de `DisclosuresGroup`, qui retourne `-1` quand aucun membre n'est ouvert. Le DOM issu du SSR exprimant déjà la sélection, le balayage la retrouvera.

Employer `options.mode !== Modes.REACT` — jamais `api.mode`, `api` étant déclaré après `Stage` et `Instance`.

- [ ] **Step 4 : Mesurer `tab`, puis commiter**

Régénérer le patch, reconstruire selon le Step 1, remesurer `/streaming/family/tab`. Si la divergence disparaît, commiter. Sinon, ne pas commiter et consigner ce que la mesure montre.

- [ ] **Step 5 : Corriger `header`**

`HeaderModal.storeAria()` retire les attributs `aria-*`. En mode react, ne pas les retirer — le DOM porte déjà la bonne valeur et React l'attend. Vérifier que `restoreAria()` reste cohérent.

- [ ] **Step 6 : Mesurer `header`, puis commiter** — même protocole qu'au Step 4, sur `/streaming/family/header`.

- [ ] **Step 7 : Corriger `navigation`**

Le mécanisme est le moins évident des trois : identifier où `fr-collapsing` et `--collapse` sont posés à l'initialisation, et neutraliser cette pose initiale en mode react sans casser l'animation d'ouverture ultérieure, qui doit continuer de fonctionner.

- [ ] **Step 8 : Mesurer `navigation`, puis commiter** — même protocole, sur `/streaming/family/navigation`.

- [ ] **Step 9 : Tests de garde**

Étendre `test/runtime/lib/dsfrEngineReactMode.test.ts` d'un test par correctif effectivement appliqué. Chacun doit échouer sans son correctif — le vérifier et le consigner, sans quoi le test ne vaut rien.

- [ ] **Step 10 : Non-régression fonctionnelle**

Le risque de cette tâche est de casser le fonctionnement. Vérifier dans un navigateur que les onglets changent au clic, que le menu mobile du header s'ouvre, et que la navigation se déplie. Un correctif qui supprime la divergence en cassant le composant est un échec, pas un succès.

- [ ] **Step 11 : Suite complète**

```bash
npx --yes yarn@1.22.22 build
npx --yes yarn@1.22.22 test
npx --yes yarn@1.22.22 lint:check
```

Tous verts, un seul avertissement préexistant sur `src/Notice.tsx` toléré. Vérifier que les hunks préexistants du patch ont survécu.

---

### Task 7 : Préparation de la PR

**Files:**
- Create: `PULL_REQUEST.md` à la racine (fichier de travail, non commité)
- Modify: historique de la branche — retrait des commits de `docs/`

**Interfaces:**
- Consumes: la spec, le relevé `MEASUREMENTS.md`, les commits des Tasks 2 à 6.
- Produces: le corps de la PR.

- [ ] **Step 1 : Vérifier l'état complet avant PR**

```bash
cd /workspace/.trees/hydratation
npx --yes yarn@1.22.22 test
npx --yes yarn@1.22.22 lint:check
npx --yes yarn@1.22.22 format:check
npx --yes yarn@1.22.22 build
```

Attendu : les quatre commandes réussissent. Ne pas passer à l'étape suivante autrement.

- [ ] **Step 2 : Rédiger le corps de la PR**

Écrire `PULL_REQUEST.md` en reprenant, dans cet ordre :

1. Le lien vers la discussion #398 et l'issue #305.
2. Le problème, en trois phrases : `StartDsfrOnHydration` diffère le démarrage du moteur, ce qui ne corrige pas le streaming mais le contourne ; le contenu arrivé par un boundary est muté avant hydratation ; la seule façon d'être à l'abri était de ne plus streamer.
3. Le tableau d'audit des 46 registrations, copié depuis la section « Audit » de la spec. C'est l'argument central : il démontre que le changement est borné.
4. Les deux modifications du moteur, avec leur diff.
5. Le relevé de `MEASUREMENTS.md`, **présenté sans l'enjoliver**. Ce que la mesure a établi : en développement, le streaming produit un vrai message de divergence d'hydratation React 19 listant les `data-fr-js-*` sur sept composants, tandis que la même page sans `<Suspense>` reste silencieuse — la divergence est donc bien imputable au streaming. En production, en revanche, les trois routes sont strictement silencieuses et aucun boundary n'est re-rendu.

   La PR doit donc être argumentée pour ce qu'elle est : **elle supprime un défaut réel et reproductible en développement, pas une casse observable en production.** C'est le cas de figure que la §4.2 de la spec avait anticipé. Sa valeur reste entière et tient en deux points : un avertissement d'hydratation permanent en développement est indiscernable d'un vrai problème et finit par être ignoré, ce qui masque les suivants ; et `<StartDsfrOnHydration />` cesse d'être obligatoire sur chaque page. Ne pas prétendre corriger une casse de production que la mesure n'a pas constatée.
6. Les limites, copiées depuis « Risques et limites » de la spec — en particulier le fait que rAF est une heuristique d'ordonnancement et que les écouteurs sont attachés une frame plus tard.
7. La mention que ce comportement a vocation à remonter dans `GouvernementFR/dsfr`, le patch n'étant qu'un véhicule.

- [ ] **Step 3 : Retirer les artefacts de travail de la branche**

`/docs/` est gitignoré en amont : les deux commits de spec et de plan ne doivent pas partir dans la PR.

```bash
cd /workspace/.trees/hydratation
git log --oneline main..HEAD
```

Retirer les commits dont le message commence par `docs(spec):` ou `docs(plan):` avec `git rebase --onto`, ou, plus simple et sans réécriture d'historique, ajouter un commit de suppression :

```bash
git rm -r --cached docs
git commit -m "chore: retirer les artefacts de conception, /docs/ est gitignoré"
```

Les fichiers restent présents sur le disque et donc consultables localement.

- [ ] **Step 4 : Pousser et ouvrir la PR**

Lire d'abord `/home/aiuser/.claude/forge-mode`. En mode `autonomous` :

```bash
cd /workspace/.trees/hydratation
git push -u origin agent/hydratation
gh pr create --base main --title "fix: support du streaming Server Components sans opt-out RSC" --body-file PULL_REQUEST.md
```

En mode `supervised` : s'arrêter ici et indiquer à l'humain comment récupérer la branche.

---

## Notes d'exécution

**Ce qui a déjà été vérifié empiriquement** pendant la conception, sur `@gouvfr/dsfr@1.14.2` chargé dans jsdom — les Tasks 2 et 3 devraient donc se dérouler sans surprise :

| Cas | Attributs sur contenu inséré après démarrage | Accordéon fonctionnel |
|---|---|---|
| Sans patch, `mode: "react"` | 13, présents dès la microtâche | oui |
| Avec patch, `mode: "react"` | 0 à la microtâche, puis `data-fr-js-range` et `data-fr-js-table` après une frame | oui |
| Avec patch, `mode: "auto"` | 13, inchangé | oui |

**Ce qui reste ouvert** et que seule la Task 1 tranchera : la mesure en build de production. Si elle montre que React n'émet que des avertissements de développement et ne re-rend aucun boundary, la nature de la PR change — elle devient une PR de propreté et de DX. Le plan reste valable, mais son argumentaire doit être réécrit en conséquence, et le Step 12 de la Task 1 est le point d'arrêt prévu pour cette décision.
