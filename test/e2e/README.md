# Tests e2e

Ces tests ne font pas partie de la CI : ils demandent un build Next et un
Chrome installé. Ils servent à prouver le correctif et à documenter la PR.

## Prérequis

-   Chrome installé (`/usr/bin/google-chrome`)
-   La bibliothèque construite : `npx --yes yarn@1.22.22 build` à la racine
-   L'application de reproduction construite :
    `cd test/integration/next-app-router-streaming && npx --yes yarn@1.22.22 build`

## Exécution

```bash
cd test/e2e
npx --yes yarn@1.22.22 install
npx playwright test
```

Le serveur Next est démarré automatiquement par Playwright sur le port 3100.
