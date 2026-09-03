// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createModal } from "../../../src/Modal/Modal";

// En mode react, le moteur DSFR n'instrumente les nœuds ajoutés qu'un
// requestAnimationFrame plus tard (Stage.mutate), pour laisser React hydrater.
// Pendant cette frame, l'élément de la modale est bien dans le DOM mais
// `window.dsfr(element).modal` vaut encore `undefined` : `open()`, appelé par
// exemple depuis un effet de montage, tombait alors sur une TypeError.

const MODAL_ID = "test-modal";

let frameCallbacks: FrameRequestCallback[] = [];
let nativeRequestAnimationFrame: typeof window.requestAnimationFrame;

function runFrame() {
    const callbacks = frameCallbacks;
    frameCallbacks = [];
    callbacks.forEach(callback => callback(0));
}

beforeEach(() => {
    frameCallbacks = [];
    nativeRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = ((callback: FrameRequestCallback) =>
        frameCallbacks.push(callback)) as typeof window.requestAnimationFrame;
    document.body.innerHTML = `<dialog id="${MODAL_ID}"></dialog>`;
});

afterEach(() => {
    window.requestAnimationFrame = nativeRequestAnimationFrame;
    delete (window as any).dsfr;
});

describe("createModal().open() — API publique", () => {
    it("ne lève pas quand le moteur n'a pas encore instrumenté la modale", () => {
        // Le moteur est démarré mais n'a pas encore instrumenté ce nœud :
        // dsfr(node) ne porte pas de propriété `modal`.
        (window as any).dsfr = () => ({});

        const modal = createModal({ "id": MODAL_ID, "isOpenedByDefault": false });

        expect(() => modal.open()).not.toThrow();
    });

    it("réessaie aux frames suivantes puis ouvre la modale", () => {
        const disclose = vi.fn();
        let isInstrumented = false;

        (window as any).dsfr = () => (isInstrumented ? { "modal": { disclose } } : {});

        const modal = createModal({ "id": MODAL_ID, "isOpenedByDefault": false });

        modal.open();
        expect(disclose).not.toHaveBeenCalled();

        // Une frame passe, le moteur n'a toujours pas instrumenté.
        runFrame();
        expect(disclose).not.toHaveBeenCalled();

        // Le moteur instrumente, la frame suivante déclenche l'ouverture.
        isInstrumented = true;
        runFrame();
        expect(disclose).toHaveBeenCalledTimes(1);
    });

    it("ouvre immédiatement quand le moteur a déjà instrumenté la modale", () => {
        const disclose = vi.fn();
        (window as any).dsfr = () => ({ "modal": { disclose } });

        const modal = createModal({ "id": MODAL_ID, "isOpenedByDefault": false });

        modal.open();

        expect(disclose).toHaveBeenCalledTimes(1);
        expect(frameCallbacks).toHaveLength(0);
    });

    it("ferme la modale par la même voie", () => {
        const conceal = vi.fn();
        let isInstrumented = false;

        (window as any).dsfr = () => (isInstrumented ? { "modal": { conceal } } : {});

        const modal = createModal({ "id": MODAL_ID, "isOpenedByDefault": false });

        modal.close();
        expect(conceal).not.toHaveBeenCalled();

        isInstrumented = true;
        runFrame();
        expect(conceal).toHaveBeenCalledTimes(1);
    });

    it("laisse remonter l'erreur quand la modale n'est pas dans le DOM", () => {
        // Vrai cas de mauvais usage : la garde ne doit pas l'avaler.
        document.body.innerHTML = "";
        (window as any).dsfr = () => null;

        const modal = createModal({ "id": MODAL_ID, "isOpenedByDefault": false });

        expect(() => modal.open()).toThrow();
    });
});
