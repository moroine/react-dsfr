import { Suspense } from "react";
import { ClientShowcase } from "../ClientShowcase";

export const dynamic = "force-dynamic";

async function SlowShowcase() {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return <ClientShowcase />;
}

// Variante de /streaming où le contenu streamé est un Client Component.
export default function StreamingClientPage() {
    return (
        <main>
            <h1 data-testid="shell">Shell immédiat</h1>
            <Suspense fallback={<p data-testid="fallback">Chargement…</p>}>
                <SlowShowcase />
            </Suspense>
        </main>
    );
}
