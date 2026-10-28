import { DsfrShowcase } from "../DsfrShowcase";

export const dynamic = "force-dynamic";

export default function NoStreamingPage() {
    return (
        <main>
            <h1 data-testid="shell">Shell immédiat</h1>
            <DsfrShowcase />
        </main>
    );
}
