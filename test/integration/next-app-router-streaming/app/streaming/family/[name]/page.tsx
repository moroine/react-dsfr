import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getDsfrFamily } from "../../../dsfr-families";

export const dynamic = "force-dynamic";

// Route de mesure (pas destinée à l'usage normal de l'app) : rend UNE seule
// famille moteur DSFR, en streaming, isolée de toutes les autres. Nécessaire
// parce que le diff d'hydratation imprimé par React est tronqué (« ... »)
// une fois toutes les familles réunies dans /streaming — voir COVERAGE.md de la branche hydratation.
async function SlowFamily({ name }: { name: string }) {
    await new Promise(resolve => setTimeout(resolve, 1500));

    const family = getDsfrFamily(name);

    if (family === undefined) {
        notFound();
    }

    return (
        <div data-testid="dsfr-showcase">
            <div data-testid={`famille-${family.id}`}>{family.render()}</div>
        </div>
    );
}

export default async function StreamingFamilyPage({
    params
}: {
    params: Promise<{ name: string }>;
}) {
    const { name } = await params;

    return (
        <main>
            <h1 data-testid="shell">Shell immédiat</h1>
            <Suspense fallback={<p data-testid="fallback">Chargement…</p>}>
                <SlowFamily name={name} />
            </Suspense>
        </main>
    );
}
