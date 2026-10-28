"use client";

import Link from "next/link";
import {
    DsfrProviderBase,
    type DsfrProviderProps
} from "@codegouvfr/react-dsfr/next-app-router";
import { defaultColorScheme } from "./defaultColorScheme";

declare module "@codegouvfr/react-dsfr/next-app-router" {
    interface RegisterLink {
        Link: typeof Link;
    }
}

export function DsfrProvider(props: DsfrProviderProps) {
    return (
        <DsfrProviderBase {...props} Link={Link} defaultColorScheme={defaultColorScheme} />
    );
}

export { StartDsfrOnHydration } from "@codegouvfr/react-dsfr/next-app-router";
