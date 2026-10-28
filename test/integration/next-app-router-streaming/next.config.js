/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: false,
    // `dist/` est compilé avec les types React 18 du package.json racine du
    // dépôt, alors que cette app de mesure tourne en React 19 (requis pour
    // que nos propres Server Components async se typent correctement). Les
    // deux exigences sont mutuellement incompatibles au niveau des types
    // (`DsfrProviderBase` n'est pas assignable comme composant JSX sous
    // React 19) sans que cela n'affecte la compilation ni le runtime — le
    // webpack build réussit avant ce gate. On désactive donc uniquement le
    // gate de typecheck du build ; voir MEASUREMENTS.md pour le détail et un
    // `tsc --noEmit` séparé pour ne pas masquer nos propres erreurs de types.
    typescript: {
        ignoreBuildErrors: true
    },
    webpack: config => {
        config.module.rules.push({
            test: /\.woff2$/,
            type: "asset/resource"
        });
        return config;
    }
};

module.exports = nextConfig;
