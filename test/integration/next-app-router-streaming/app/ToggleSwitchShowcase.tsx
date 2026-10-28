"use client";

// ToggleSwitch (src/ToggleSwitch.tsx) utilise useState/useEffect en interne
// sans déclarer "use client" lui-même (à la différence de Range ou de
// PasswordInput). L'utiliser directement depuis DsfrShowcase.tsx (Server
// Component) fait échouer le rendu RSC ("useState only works in Client
// Components"). On l'isole donc ici, conformément à la consigne du brief,
// plutôt que de convertir tout le showcase en composant client.
import { ToggleSwitch } from "@codegouvfr/react-dsfr/ToggleSwitch";

export function ToggleSwitchShowcase() {
    return <ToggleSwitch label="Interrupteur de test" inputTitle="toggle-test" defaultChecked />;
}
