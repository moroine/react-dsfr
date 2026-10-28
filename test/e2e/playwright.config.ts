import { defineConfig } from "@playwright/test";
import { rmSync } from "fs";
import { join as pathJoin } from "path";

const appDirPath = pathJoin(__dirname, "..", "integration", "next-app-router-streaming");

// Le cache webpack persistant de Next.js (`.next/cache`) sert indéfiniment la
// version compilée d'une dépendance `file:` : `@codegouvfr/react-dsfr` est
// recopié par `yarn install --force` sans changer de numéro de version, et
// webpack considère `node_modules` comme immuable à version constante. Un
// serveur de dev démarré avant un cycle build/install peut donc livrer au
// navigateur un chunk d'AVANT le patch, sans le moindre signe extérieur.
// Ce piège a coûté une enquête entière : voir
// test/integration/next-app-router-streaming/LOAD-EFFECT.md.
// D'où les deux mesures ci-dessous, indissociables :
//  - `.next` est supprimé au chargement de cette configuration, donc avant que
//    Playwright ne démarre le serveur ;
//  - `reuseExistingServer` est à false, pour qu'aucun serveur déjà lancé
//    (donc déjà compilé, éventuellement à partir d'un `.next` périmé) ne
//    puisse servir la mesure.
// `TEST_WORKER_INDEX` n'est défini que dans les processus « worker », qui
// rechargent eux aussi cette configuration — alors que le serveur de dev
// tourne déjà. Sans ce garde, chaque worker supprimerait `.next` sous les
// pieds du serveur, qui répondrait alors
// « missing required error components, refreshing... ».
if (process.env.TEST_WORKER_INDEX === undefined) {
    rmSync(pathJoin(appDirPath, ".next"), { recursive: true, force: true });
}

export default defineConfig({
    testDir: ".",
    // Le serveur de dev compile à la première requête, en plus du délai de
    // streaming de 1,5 s. Le `.next` étant systématiquement supprimé, la
    // toute première compilation est toujours à froid.
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
        cwd: appDirPath,
        url: "http://localhost:3100/no-streaming",
        reuseExistingServer: false,
        timeout: 180_000
    }
});
