import type { ReactNode } from "react";
import { Table } from "@codegouvfr/react-dsfr/Table";
import { Accordion } from "@codegouvfr/react-dsfr/Accordion";
import { Button } from "@codegouvfr/react-dsfr/Button";
import { ButtonsGroup } from "@codegouvfr/react-dsfr/ButtonsGroup";
import { Tabs } from "@codegouvfr/react-dsfr/Tabs";
import { SegmentedControl } from "@codegouvfr/react-dsfr/SegmentedControl";
import { Tooltip } from "@codegouvfr/react-dsfr/Tooltip";
import { Range } from "@codegouvfr/react-dsfr/Range";
import { Breadcrumb } from "@codegouvfr/react-dsfr/Breadcrumb";
import { Card } from "@codegouvfr/react-dsfr/Card";
import { Checkbox } from "@codegouvfr/react-dsfr/Checkbox";
import { Display } from "@codegouvfr/react-dsfr/Display";
import { Header } from "@codegouvfr/react-dsfr/Header";
import { createModal } from "@codegouvfr/react-dsfr/Modal";
import { MainNavigation } from "@codegouvfr/react-dsfr/MainNavigation";
import { PasswordInput } from "@codegouvfr/react-dsfr/blocks/PasswordInput";
import { SideMenu } from "@codegouvfr/react-dsfr/SideMenu";
import { Tag } from "@codegouvfr/react-dsfr/Tag";
import { Tile } from "@codegouvfr/react-dsfr/Tile";
import { ToggleSwitchShowcase } from "./ToggleSwitchShowcase";

// createModal() doit être appelé au niveau module, hors du composant
// (voir src/Modal/Modal.tsx) : il enregistre un id DOM fixe partagé par
// toutes les instances de la modale qu'il retourne.
// isOpenedByDefault: true — pour exercer réellement le mécanisme
// DisclosuresGroup (ModalsGroup) au chargement, à l'image de Tabs qui force
// la sélection de l'onglet 0 (TabsGroup.getIndex(defaultIndex = 0)). Une
// modale fermée par défaut ne force aucun index initial et ne teste donc
// pas ce chemin de code.
const testModal = createModal({
    isOpenedByDefault: true,
    id: "showcase-test-modal"
});

export type DsfrFamily = {
    /** Utilisé pour data-testid={`famille-${id}`} et pour l'URL des routes d'isolation */
    id: string;
    render: () => ReactNode;
};

// Une entrée par famille moteur DSFR instrumentée. Chaque `render` est
// utilisé à la fois par le showcase combiné (DsfrShowcase.tsx) et par les
// routes d'isolation (app/streaming/family/[name], app/no-streaming/family/[name])
// — nécessaires car le diff d'hydratation imprimé par React est tronqué
// (« ... ») une fois toutes les familles réunies dans un seul arbre : voir
// COVERAGE.md.
export const dsfrFamilies: DsfrFamily[] = [
    // -- familles déjà couvertes avant cette tâche --
    {
        id: "accordion",
        render: () => <Accordion label="Accordéon de test">Contenu de l&apos;accordéon.</Accordion>
    },
    {
        id: "accordion-expanded",
        // Accordéon ouvert par défaut : react-dsfr rend le bouton avec
        // aria-expanded="true" mais NE rend PAS fr-collapse--expanded sur le
        // panneau. Le moteur doit donc l'y poser à l'initialisation. Cas
        // volontairement couvert pour mesurer ce qu'il coûte en divergence
        // d'hydratation.
        render: () => (
            <Accordion label="Accordéon ouvert par défaut" defaultExpanded>
                Contenu de l&apos;accordéon ouvert.
            </Accordion>
        )
    },
    {
        id: "table",
        render: () => (
            <Table
                caption="Table de test"
                headers={["Colonne A", "Colonne B"]}
                data={[
                    ["a1", "b1"],
                    ["a2", "b2"]
                ]}
            />
        )
    },
    {
        id: "tab",
        // Les deux panneaux ont DÉLIBÉRÉMENT des hauteurs très différentes.
        // Tous les panneaux d'un fr-tabs sont superposés dans le même flux :
        // sans --tabs-height, le conteneur prend la hauteur du plus haut. Avec
        // deux panneaux de même hauteur, ce défaut est strictement invisible —
        // c'est ce qui l'avait laissé passer. Le panneau 2, non sélectionné, est
        // donc beaucoup plus haut que le panneau 1.
        render: () => (
            <Tabs
                tabs={[
                    { label: "Onglet 1", content: <p>Contenu 1, une seule ligne.</p> },
                    {
                        label: "Onglet 2",
                        content: (
                            <div data-testid="tab-panel-2-content">
                                {Array.from({ length: 12 }, (_, index) => (
                                    <p key={index}>
                                        Contenu 2, ligne {index + 1} — ce panneau est
                                        volontairement beaucoup plus haut que le premier.
                                    </p>
                                ))}
                            </div>
                        )
                    }
                ]}
            />
        )
    },
    {
        id: "segmented",
        render: () => (
            <SegmentedControl
                legend="Légende du contrôle segmenté"
                segments={[
                    { label: "Un", nativeInputProps: { defaultChecked: true } },
                    { label: "Deux" }
                ]}
            />
        )
    },
    {
        id: "button",
        render: () => (
            <ButtonsGroup
                buttonsEquisized
                buttons={[
                    { children: "Bouton un" },
                    { children: "Bouton deux", priority: "secondary" }
                ]}
            />
        )
    },
    {
        id: "range",
        render: () => <Range label="Curseur de test" min={0} max={100} />
    },
    {
        id: "tooltip",
        render: () => (
            <>
                <Button aria-describedby="tooltip-test">Survolez-moi</Button>
                <Tooltip id="tooltip-test" title="Texte d'infobulle" />
            </>
        )
    },

    // -- familles ajoutées par cette tâche --
    {
        id: "breadcrumb",
        render: () => (
            <Breadcrumb
                homeLinkProps={{ href: "#" }}
                segments={[{ label: "Section", linkProps: { href: "#" } }]}
                currentPageLabel="Page de test"
            />
        )
    },
    {
        id: "card",
        render: () => (
            <Card title="Carte de test" desc="Description de la carte." linkProps={{ href: "#" }} />
        )
    },
    {
        id: "checkbox",
        render: () => (
            <Checkbox
                legend="Légende de la case à cocher"
                options={[
                    {
                        label: "Option A",
                        nativeInputProps: { name: "checkbox-test-a", defaultChecked: true }
                    },
                    {
                        label: "Option B",
                        nativeInputProps: { name: "checkbox-test-b" }
                    }
                ]}
            />
        )
    },
    {
        id: "display",
        render: () => <Display />
    },
    {
        id: "header",
        render: () => (
            <Header
                brandTop={
                    <>
                        Intitulé
                        <br />
                        officiel
                    </>
                }
                homeLinkProps={{ href: "#", title: "Accueil" }}
                serviceTitle="Service de test"
                disableDisplay
                quickAccessItems={[
                    {
                        iconId: "fr-icon-lock-line",
                        text: "Se connecter",
                        linkProps: { href: "#" }
                    }
                ]}
            />
        )
    },
    {
        id: "modal",
        render: () => (
            <>
                <Button nativeButtonProps={testModal.buttonProps}>Ouvrir la modale</Button>
                <testModal.Component title="Modale de test">Contenu de la modale.</testModal.Component>
            </>
        )
    },
    {
        id: "navigation",
        render: () => (
            <MainNavigation
                items={[
                    { text: "Accueil", linkProps: { href: "#" }, isActive: true },
                    {
                        text: "Menu",
                        menuLinks: [{ text: "Sous-lien", linkProps: { href: "#" } }]
                    }
                ]}
            />
        )
    },
    {
        id: "password",
        render: () => <PasswordInput label="Mot de passe de test" />
    },
    {
        id: "sidemenu",
        render: () => (
            <SideMenu
                align="left"
                burgerMenuButtonText="Menu"
                items={[
                    { text: "Lien 1", linkProps: { href: "#" }, isActive: true },
                    { text: "Lien 2", linkProps: { href: "#" } },
                    // Sous-menu déplié par défaut : exerce le même mécanisme
                    // DisclosuresGroup (CollapsesGroup) qu'un onglet
                    // sélectionné par défaut ou une modale ouverte par
                    // défaut — un sous-menu jamais déplié ne force aucun
                    // état initial et ne teste donc pas ce chemin de code.
                    {
                        text: "Sous-menu",
                        expandedByDefault: true,
                        items: [{ text: "Sous-lien", linkProps: { href: "#" } }]
                    }
                ]}
            />
        )
    },
    {
        id: "tag",
        render: () => (
            <>
                <Tag nativeButtonProps={{}} pressed={false}>
                    Tag pressable
                </Tag>
                <Tag nativeButtonProps={{}} dismissible>
                    Tag dismissible
                </Tag>
            </>
        )
    },
    {
        id: "tile",
        render: () => <Tile title="Tuile de test" linkProps={{ href: "#" }} />
    },
    {
        id: "toggle",
        render: () => <ToggleSwitchShowcase />
    }
];

export function getDsfrFamily(id: string): DsfrFamily | undefined {
    return dsfrFamilies.find(family => family.id === id);
}
