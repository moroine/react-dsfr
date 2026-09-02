import { Suspense } from "react";
import { StartDsfrOnHydration } from "../dsfr-bootstrap";
import { DsfrShowcase } from "../DsfrShowcase";

export const dynamic = "force-dynamic";

async function SlowShowcase() {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return <DsfrShowcase />;
}

export default function StreamingLegacyPage() {
    return (
        <main>
            <StartDsfrOnHydration />
            <h1 data-testid="shell">Shell immédiat</h1>
            <Suspense fallback={<p data-testid="fallback">Chargement…</p>}>
                <SlowShowcase />
            </Suspense>
        </main>
    );
}
