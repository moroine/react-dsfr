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

        const providerSource = source.slice(0, markerIndex).replace(/\/\*[\s\S]*?\*\//g, "");

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
