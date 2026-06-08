"use client";

import { createContext, useContext } from "react";

export interface HouseholdSummary {
  id: string;
  name: string;
}

interface HouseholdContextValue {
  households: HouseholdSummary[];
  currentId: string | null;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  households: [],
  currentId: null,
});

/** Provides the household list + active household to client components (e.g. the switcher). */
export function HouseholdProvider({
  households,
  currentId,
  children,
}: HouseholdContextValue & { children: React.ReactNode }) {
  return (
    <HouseholdContext.Provider value={{ households, currentId }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHouseholds() {
  return useContext(HouseholdContext);
}
