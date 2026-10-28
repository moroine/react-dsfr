import React from "react";

type HydrationGateProps = { "data-fr-hydrating"?: true };

const gateProps: HydrationGateProps = { "data-fr-hydrating": true };
const noGateProps: HydrationGateProps = {};

const unsubscribe = () => undefined;
const subscribe = () => unsubscribe;
const getSnapshot = () => true;
const getServerSnapshot = () => false;

// Absent from the react-server build of React. A component rendered as a
// Server Component has no client effect that could ever lift the gate, so it
// renders none and keeps its previous behavior.
const { useSyncExternalStore } = React as Partial<typeof React>;

/**
 * Props to spread on the root element of a component the DSFR engine
 * instruments. The engine leaves a subtree carrying `data-fr-hydrating` alone.
 *
 * The attribute is rendered on the server and kept while React hydrates the
 * component (server snapshot), then removed by the re-render React schedules
 * right after hydration (client snapshot). The engine observes that removal
 * and instruments the subtree. A component mounted on the client without
 * hydration never renders it.
 */
export const useHydrationGate: () => HydrationGateProps =
    useSyncExternalStore === undefined
        ? () => noGateProps
        : function useHydrationGate() {
              const isHydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

              return isHydrated ? noGateProps : gateProps;
          };
