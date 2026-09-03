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

// Deux onglets, le premier déjà sélectionné par le HTML — reproduit ce que
// rend le serveur pour <Tabs> avant hydratation.
const TABS_MARKUP = `
<div id="tabs-1" class="fr-tabs">
  <ul class="fr-tabs__list" role="tablist" aria-label="Test">
    <li role="presentation">
      <button class="fr-tabs__tab" tabindex="0" role="tab" aria-selected="true" aria-controls="tabpanel-1-panel" id="tabpanel-1">Onglet 1</button>
    </li>
    <li role="presentation">
      <button class="fr-tabs__tab" tabindex="-1" role="tab" aria-selected="false" aria-controls="tabpanel-2-panel" id="tabpanel-2">Onglet 2</button>
    </li>
  </ul>
  <div id="tabpanel-1-panel" class="fr-tabs__panel fr-tabs__panel--selected" role="tabpanel" aria-labelledby="tabpanel-1" tabindex="0">Contenu 1</div>
  <div id="tabpanel-2-panel" class="fr-tabs__panel" role="tabpanel" aria-labelledby="tabpanel-2" tabindex="0" hidden>Contenu 2</div>
</div>
`;

// Menu mobile du header, avec aria-labelledby déjà posé par le serveur —
// reproduit .fr-header__menu.fr-modal tel que <Header> le rend.
const HEADER_MARKUP = `
<div class="fr-header__menu fr-modal" id="header-menu-modal-1" aria-labelledby="header-menu-btn-1">
  <div class="fr-header__menu-links"></div>
</div>
`;

// Menu déroulant de navigation principale, fermé par défaut — reproduit ce
// que rend <MainNavigation> avant hydratation (fr-collapse sans
// fr-collapsing ni --collapse, le serveur ne les pose jamais).
const NAV_MARKUP = `
<nav class="fr-nav" id="nav-1" role="navigation" aria-label="Menu principal">
  <ul class="fr-nav__list">
    <li class="fr-nav__item">
      <button class="fr-nav__btn" aria-expanded="false" aria-controls="nav-menu-1">Menu</button>
      <div class="fr-menu fr-collapse" id="nav-menu-1">
        <ul class="fr-menu__list">
          <li><a class="fr-nav__link" href="#">Sous-lien</a></li>
        </ul>
      </div>
    </li>
  </ul>
</nav>
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

async function loadEngine(params: {
    mode: "react" | "auto";
    // Surcharge le contenu de body, MARKUP par défaut — pour exercer un
    // mécanisme précis (tabs, header, navigation) sans polluer les tests
    // existants qui reposent sur MARKUP tel quel.
    markup?: string;
    // Réponse de matchMedia() — false par défaut (aucun media query ne
    // matche, comme un viewport étroit). true fait passer isBreakpoint(...)
    // à vrai pour tous les media queries, simulant un viewport large.
    matchMediaMatches?: boolean;
}) {
    const { mode, markup = MARKUP, matchMediaMatches = false } = params;

    const dom = new JSDOM(`<!doctype html><html><head></head><body></body></html>`, {
        pretendToBeVisual: true,
        runScripts: "outside-only",
        url: "https://example.test/"
    });

    const window = dom.window as DOMWindow;

    /* eslint-disable @typescript-eslint/no-empty-function -- stubs de test : les
       corps vides sont le comportement voulu, DSFR n'a besoin que de la présence
       de ces méthodes, pas de leur effet. */
    class ObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }

    (window as any).ResizeObserver = ObserverStub;
    (window as any).IntersectionObserver = ObserverStub;
    (window as any).matchMedia = (query: string) => ({
        matches: matchMediaMatches,
        media: query,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {}
    });
    /* eslint-enable @typescript-eslint/no-empty-function */
    (window as any).dsfr = { verbose: false, mode };

    (window as any).eval(fs.readFileSync(ENGINE_PATH, "utf8"));

    window.document.body.innerHTML = markup;
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

        expect(collectJsAttributes(holder)).toEqual(["data-fr-js-range", "data-fr-js-table"]);

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

    it("ne double pas l'instanciation d'un nœud retiré puis réinséré dans le même lot", async () => {
        const { window } = await loadEngine({ mode: "react" });

        const holder = window.document.createElement("div");
        holder.innerHTML = `
<section class="fr-accordion">
  <h3 class="fr-accordion__title">
    <button class="fr-accordion__btn" aria-expanded="false" aria-controls="dup-1">Titre</button>
  </h3>
  <div class="fr-collapse" id="dup-1">contenu</div>
</section>`;

        // Retiré puis réinséré de façon synchrone, avant que le MutationObserver
        // ne délivre son callback (une microtâche) : les mutations « ajout »,
        // « retrait », « ajout » de ce même nœud arrivent groupées dans le même
        // appel à mutate(), exerçant this.modifications.indexOf(node) === -1,
        // qui évite de pousser deux fois le même nœud dans la file différée.
        window.document.body.appendChild(holder);
        window.document.body.removeChild(holder);
        window.document.body.appendChild(holder);

        await new Promise(resolve => setTimeout(resolve, 80));

        const button = window.document.querySelector(".fr-accordion__btn") as HTMLElement;
        expect(button.getAttribute("aria-expanded")).toBe("false");

        // Un seul écouteur attaché : un clic ne doit produire qu'un seul
        // basculement, pas un aller-retour false -> true -> false.
        button.click();
        await new Promise(resolve => setTimeout(resolve, 80));

        expect(button.getAttribute("aria-expanded")).toBe("true");

        window.close();
    });

    // Tests de garde Task 8 : chacun échoue sans son correctif — vérifié en
    // retirant temporairement le hunk correspondant du fichier moteur avant
    // de le restaurer (voir task-8-report.md).

    it("tab : ne pose ni --tabs-height, ni --tabs-list-height, ni --direction-end sur un contenu inséré tardivement", async () => {
        // Contenu inséré après coup (comme le contenu streamé dans l'app
        // réelle), plutôt que présent dès dsfr.start() : évite que
        // document.fonts.ready (déclencheur global, à usage unique, du
        // module de redimensionnement) ne provoque un second passage sur
        // cette instance et ne masque le correctif — un piège spécifique au
        // montage synchrone d'un test, sans rapport avec le mécanisme testé.
        const { window } = await loadEngine({ mode: "react" });

        const holder = window.document.createElement("div");
        holder.innerHTML = TABS_MARKUP;
        window.document.body.appendChild(holder);

        await new Promise(resolve => setTimeout(resolve, 80));

        const tabs = holder.querySelector("#tabs-1") as HTMLElement;
        const list = holder.querySelector(".fr-tabs__list") as HTMLElement;
        const secondPanel = holder.querySelector("#tabpanel-2-panel") as HTMLElement;

        // Le HTML rendu par le serveur ne porte ni --tabs-height (conteneur),
        // ni --tabs-list-height (liste), ni fr-tabs__panel--direction-end sur
        // le panneau non sélectionné : le moteur ne doit rien y ajouter tant
        // qu'aucun changement d'onglet réel n'a eu lieu.
        expect(tabs.style.getPropertyValue("--tabs-height")).toBe("");
        expect(list.style.getPropertyValue("--tabs-list-height")).toBe("");
        expect(secondPanel.className).not.toContain("--direction-end");

        window.close();
    });

    it("header : ne retire jamais aria-labelledby du menu mobile en viewport large", async () => {
        // Viewport large (matchMedia matche tout) : HeaderModal.resize()
        // prend la branche deactivateModal(), qui appelle storeAria() sans
        // jamais appeler restoreAria() ensuite — la modale du menu mobile
        // n'étant pas censée s'ouvrir sur ce viewport. Sans le correctif,
        // aria-labelledby reste donc retiré en permanence, pas seulement le
        // temps d'une course : un cas simple et déterministe à tester.
        const { window } = await loadEngine({
            mode: "react",
            markup: HEADER_MARKUP,
            matchMediaMatches: true
        });

        expect(window.document.getElementById("header-menu-modal-1")?.getAttribute("aria-labelledby")).toBe(
            "header-menu-btn-1"
        );

        window.close();
    });

    it("navigation : ne pose ni fr-collapsing ni --collapse à la synchronisation initiale", async () => {
        const { window } = await loadEngine({ mode: "react", markup: NAV_MARKUP });

        const collapse = window.document.getElementById("nav-menu-1") as HTMLElement;

        // Le HTML rendu par le serveur ne porte ni la classe transitoire
        // fr-collapsing, ni la variable --collapse : la première synchro
        // (menu fermé par défaut) ne doit rien y ajouter.
        expect(collapse.className).not.toContain("fr-collapsing");
        expect(collapse.style.getPropertyValue("--collapse")).toBe("");

        window.close();
    });
});
