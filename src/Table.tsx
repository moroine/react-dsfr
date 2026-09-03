import React, { forwardRef, memo, type ReactNode, type CSSProperties } from "react";
import { assert } from "tsafe/assert";
import type { Equals } from "tsafe";
import { fr } from "./fr";
import { cx } from "./tools/cx";
import { symToStr } from "tsafe/symToStr";
import type { FrClassName } from "./fr/generatedFromCss/classNames";
import { useAnalyticsId } from "./tools/useAnalyticsId";

export type TableProps = {
    id?: string;
    data: ReactNode[][];
    className?: string;
    caption?: ReactNode;
    headers?: ReactNode[];
    /** Default: false */
    fixed?: boolean;
    /** Default: false */
    noScroll?: boolean;
    /** Default: false */
    bordered?: boolean;
    /** Default: false */
    noCaption?: boolean;
    /** Default: false */
    bottomCaption?: boolean;
    style?: CSSProperties;
    colorVariant?: TableProps.ColorVariant;
};

export namespace TableProps {
    type ExtractColorVariant<FrClassName> = FrClassName extends `fr-table--${infer AccentColor}`
        ? Exclude<
              AccentColor,
              "no-scroll" | "no-caption" | "caption-bottom" | "layout-fixed" | "bordered"
          >
        : never;

    export type ColorVariant = ExtractColorVariant<FrClassName>;
}

/** @see <https://components.react-dsfr.codegouv.studio/?path=/docs/tableau>  */
export const Table = memo(
    forwardRef<HTMLDivElement, TableProps>((props, ref) => {
        const {
            id: id_props,
            data,
            headers,
            caption,
            bordered = false,
            noScroll = false,
            fixed = false,
            noCaption = false,
            bottomCaption = false,
            colorVariant,
            className,
            style,
            ...rest
        } = props;

        assert<Equals<keyof typeof rest, never>>();

        const id = useAnalyticsId({
            "defaultIdPrefix": "fr-table",
            "explicitlyProvidedId": id_props
        });

        return (
            <div
                id={id}
                ref={ref}
                style={style}
                // Le moteur DSFR pose data-fr-js-table="true" sur ce nœud après
                // hydratation ; le CSS en dépend, donc l'attribut ne peut pas être
                // supprimé côté moteur. suppressHydrationWarning ne porte que d'un
                // seul niveau : il couvre cet attribut-là, mais pas les mutations
                // que le moteur applique aux descendants — TableElement pose les
                // classes fr-table__shadow* sur le <table> enfant, TableRow une
                // variable --row-height sur les <tr>. Ces divergences résiduelles
                // ne sont donc pas couvertes ici ; elles restent à traiter.
                suppressHydrationWarning
                className={cx(
                    fr.cx(
                        "fr-table",
                        {
                            "fr-table--bordered": bordered,
                            "fr-table--no-scroll": noScroll,
                            "fr-table--layout-fixed": fixed,
                            "fr-table--no-caption": noCaption,
                            "fr-table--caption-bottom": bottomCaption
                        },
                        colorVariant !== undefined && `fr-table--${colorVariant}`
                    ),
                    className
                )}
            >
                <table>
                    {caption !== undefined && <caption>{caption}</caption>}
                    {headers !== undefined && (
                        <thead>
                            <tr>
                                {headers.map((header, i) => (
                                    <th key={i} scope="col">
                                        {header}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {data.map((row, i) => (
                            <tr key={i}>
                                {row.map((col, j) => (
                                    <td key={j}>{col}</td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    })
);

Table.displayName = symToStr({ Table });

export default Table;
