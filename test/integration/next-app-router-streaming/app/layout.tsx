import type { ReactNode } from "react";
import { DsfrProvider } from "./dsfr-bootstrap";
import { DsfrHead, getHtmlAttributes } from "./dsfr-bootstrap/server-only";

export default function RootLayout({ children }: { children: ReactNode }) {
    const lang = "fr";

    return (
        <html {...getHtmlAttributes({ lang })}>
            <head>
                <title>Repro streaming DSFR</title>
                <DsfrHead />
            </head>
            <body>
                <DsfrProvider lang={lang}>{children}</DsfrProvider>
            </body>
        </html>
    );
}
