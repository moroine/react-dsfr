import { dsfrFamilies } from "./dsfr-families";

export function DsfrShowcase() {
    return (
        <div data-testid="dsfr-showcase">
            {dsfrFamilies.map(family => (
                <div data-testid={`famille-${family.id}`} key={family.id}>
                    {family.render()}
                </div>
            ))}
        </div>
    );
}
