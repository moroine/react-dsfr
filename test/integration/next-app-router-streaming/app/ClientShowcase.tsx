"use client";

import { DsfrShowcase } from "./DsfrShowcase";
import { getDsfrFamily } from "./dsfr-families";

// Mêmes familles que DsfrShowcase, rendues cette fois comme Client
// Components. C'est le seul cas où les composants react-dsfr peuvent poser la
// porte data-fr-hydrating : rendus comme Server Components, ils n'ont aucun
// effet client pour la lever, et useHydrationGate n'en pose donc aucune.
export function ClientShowcase(props: { familyId?: string }) {
    const { familyId } = props;

    if (familyId === undefined) {
        return <DsfrShowcase />;
    }

    const family = getDsfrFamily(familyId);

    if (family === undefined) {
        return null;
    }

    return (
        <div data-testid="dsfr-showcase">
            <div data-testid={`famille-${family.id}`}>{family.render()}</div>
        </div>
    );
}
