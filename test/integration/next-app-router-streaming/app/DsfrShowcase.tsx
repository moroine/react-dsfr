import { Table } from "@codegouvfr/react-dsfr/Table";
import { Accordion } from "@codegouvfr/react-dsfr/Accordion";
import { Button } from "@codegouvfr/react-dsfr/Button";
import { ButtonsGroup } from "@codegouvfr/react-dsfr/ButtonsGroup";
import { Tabs } from "@codegouvfr/react-dsfr/Tabs";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import { Tooltip } from "@codegouvfr/react-dsfr/Tooltip";
import { Range } from "@codegouvfr/react-dsfr/Range";

export function DsfrShowcase() {
    return (
        <div data-testid="dsfr-showcase">
            <Accordion label="Accordéon de test">
                Contenu de l&apos;accordéon.
            </Accordion>

            <Table
                caption="Table de test"
                headers={["Colonne A", "Colonne B"]}
                data={[
                    ["a1", "b1"],
                    ["a2", "b2"]
                ]}
            />

            <Tabs
                tabs={[
                    { label: "Onglet 1", content: <p>Contenu 1</p> },
                    { label: "Onglet 2", content: <p>Contenu 2</p> }
                ]}
            />

            <SegmentedControl
                legend="Légende du contrôle segmenté"
                segments={[
                    { label: "Un", nativeInputProps: { defaultChecked: true } },
                    { label: "Deux" }
                ]}
            />

            <ButtonsGroup
                buttonsEquisized
                buttons={[
                    { children: "Bouton un" },
                    { children: "Bouton deux", priority: "secondary" }
                ]}
            />

            <Range label="Curseur de test" min={0} max={100} />

            <Button aria-describedby="tooltip-test">Survolez-moi</Button>
            <Tooltip id="tooltip-test" title="Texte d'infobulle" />
        </div>
    );
}
