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

    // "commit" (et non le "load" par défaut) : la réponse streamée ne
    // termine (événement "load") qu'une fois le Suspense résolu, ce qui
    // masquerait l'état intermédiaire (shell + fallback) qu'on veut observer
    // ici. "commit" rend la main dès que les en-têtes arrivent, et laisse
    // les assertions Playwright ci-dessous attendre chaque état par
    // auto-retry.
    await page.goto("/streaming", { waitUntil: "commit" });

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

    // La table a bien survécu à l'hydratation (contenu, pas seulement
    // absence de message) — c'est le composant qui porte
    // suppressHydrationWarning, on vérifie donc que le contenu réel est
    // correct, pas juste que l'avertissement est tu.
    const table = page.getByTestId("dsfr-showcase").locator("table");
    await expect(table.locator("caption")).toHaveText("Table de test");
    await expect(table.locator("tbody tr")).toHaveCount(2);
    await expect(table.locator("tbody tr").first().locator("td").first()).toHaveText("a1");

    // Le curseur (Range, lui aussi suppressHydrationWarning) est bien
    // piloté par le moteur DSFR après hydratation : sa sortie est
    // renseignée à l'initialisation puis suit l'interaction utilisateur.
    const rangeInput = page.locator("input[type=range]").first();
    const rangeOutput = page.locator(".fr-range__output").first();
    await expect(rangeOutput).not.toHaveText("");
    await rangeInput.fill("80");
    await rangeInput.dispatchEvent("input");
    await expect(rangeOutput).toHaveText("80");
});

test("StartDsfrOnHydration monté : toujours fonctionnel", async ({ page }) => {
    const hydrationMessages: string[] = [];
    // Le message React « Hydration failed... » n'est jamais émis via
    // console : c'est une exception, remontée uniquement via
    // l'événement "pageerror". Le premier test le vérifie déjà ; on le
    // vérifie ici aussi pour ne pas laisser cette route sans ce filet —
    // React ne remonte pas toujours le même diagnostic par la même voie
    // sur les deux routes de streaming.
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

    await page.goto("/streaming-legacy");
    await expect(page.getByTestId("dsfr-showcase")).toBeVisible({ timeout: 30_000 });

    expect(hydrationMessages).toEqual([]);
    expect(pageErrors).toEqual([]);

    // dsfrEffect() est idempotent : le monter en plus de DsfrProvider ne doit
    // rien casser. C'est le critère d'acceptation n°4 de la spec.
    const accordionButton = page.locator(".fr-accordion__btn").first();
    await accordionButton.click();
    await expect(accordionButton).toHaveAttribute("aria-expanded", "true");
});

test("sans streaming : aucune divergence d'hydratation", async ({ page }) => {
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

    await page.goto("/no-streaming");
    await expect(page.getByTestId("dsfr-showcase")).toBeVisible();

    expect(hydrationMessages).toEqual([]);
    expect(pageErrors).toEqual([]);

    // Pas de streaming ici : tout l'arbre, y compris la table et le
    // curseur, est hydraté en un seul passage. On vérifie qu'ils sont
    // bien fonctionnels, pas seulement silencieux.
    const table = page.getByTestId("dsfr-showcase").locator("table");
    await expect(table.locator("caption")).toHaveText("Table de test");
    await expect(table.locator("tbody tr")).toHaveCount(2);

    const rangeOutput = page.locator(".fr-range__output").first();
    await expect(rangeOutput).not.toHaveText("");
});
