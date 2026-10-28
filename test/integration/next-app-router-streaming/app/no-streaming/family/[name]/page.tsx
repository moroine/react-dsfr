import { notFound } from "next/navigation";
import { getDsfrFamily } from "../../../dsfr-families";

export const dynamic = "force-dynamic";

// Pendant de /streaming/family/[name] mais sans Suspense/délai : sert de
// témoin par famille (voir COVERAGE.md).
export default async function NoStreamingFamilyPage({
    params
}: {
    params: Promise<{ name: string }>;
}) {
    const { name } = await params;

    const family = getDsfrFamily(name);

    if (family === undefined) {
        notFound();
    }

    return (
        <main>
            <h1 data-testid="shell">Shell immédiat</h1>
            <div data-testid="dsfr-showcase">
                <div data-testid={`famille-${family.id}`}>{family.render()}</div>
            </div>
        </main>
    );
}
