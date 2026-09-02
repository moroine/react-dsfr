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
