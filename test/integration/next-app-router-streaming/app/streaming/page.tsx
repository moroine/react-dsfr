import { Suspense } from "react";
import { StartDsfrOnHydration } from "../dsfr-bootstrap";
import { DsfrShowcase } from "../DsfrShowcase";

export const dynamic = "force-dynamic";

async function SlowShowcase() {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return <DsfrShowcase />;
}

export default function StreamingPage() {
    return (
        <main>
            {/* Setup actuellement documenté : « You must mount this component on
                every pages of your App! ». Sans lui, dsfrEffect() n'est jamais
                appelé et le moteur ne démarre pas — la mesure ne relèverait rien.
                La Task 5 le retirera d'ici. */}
            <StartDsfrOnHydration />
            <h1 data-testid="shell">Shell immédiat</h1>
            <Suspense fallback={<p data-testid="fallback">Chargement…</p>}>
                <SlowShowcase />
            </Suspense>
        </main>
    );
}
