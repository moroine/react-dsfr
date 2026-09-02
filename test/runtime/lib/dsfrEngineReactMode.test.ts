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
});
