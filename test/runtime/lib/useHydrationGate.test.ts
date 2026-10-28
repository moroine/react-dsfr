// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { Accordion } from "../../../src/Accordion";

const element = React.createElement(Accordion, { label: "Title" }, "Content");

const getGate = (container: HTMLElement) =>
    container.querySelector(".fr-accordion")!.getAttribute("data-fr-hydrating");

describe("useHydrationGate", () => {
    it("renders the gate on the server", () => {
        const container = document.createElement("div");
        container.innerHTML = renderToString(element);

        expect(getGate(container)).toBe("true");
    });

    it("lifts the gate once the component is hydrated", async () => {
        const container = document.createElement("div");
        container.innerHTML = renderToString(element);
        document.body.appendChild(container);

        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

        await act(async () => {
            hydrateRoot(container, element);
        });

        expect(getGate(container)).toBeNull();
    });

    it("never renders the gate when mounted on the client without hydration", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);

        (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

        const gateValues: (string | null)[] = [];
        const observer = new MutationObserver(() => {
            const accordion = container.querySelector(".fr-accordion");
            if (accordion !== null) gateValues.push(accordion.getAttribute("data-fr-hydrating"));
        });
        observer.observe(container, { childList: true, subtree: true, attributes: true });

        await act(async () => {
            createRoot(container).render(element);
        });

        observer.disconnect();

        expect(getGate(container)).toBeNull();
        expect(gateValues.filter(value => value !== null)).toEqual([]);
    });
});
