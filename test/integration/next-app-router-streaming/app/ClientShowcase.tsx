"use client";

import { DsfrShowcase } from "./DsfrShowcase";
import { getDsfrFamily } from "./dsfr-families";

// Mêmes familles que DsfrShowcase, rendues cette fois comme Client
// Components : les deux chemins par lesquels un composant react-dsfr pose et
// lève sa porte data-fr-hydrating doivent fonctionner.
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
