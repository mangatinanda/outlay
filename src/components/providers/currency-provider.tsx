"use client";

import { createContext, useCallback, useContext } from "react";
import { formatCurrency } from "@/components/shared/currency-display";

const CurrencyContext = createContext<string>("INR");

/** Provides the household's currency to all client components below it. */
export function CurrencyProvider({
  currency,
  children,
}: {
  currency: string;
  children: React.ReactNode;
}) {
  return (
    <CurrencyContext.Provider value={currency}>
      {children}
    </CurrencyContext.Provider>
  );
}

/** The active household currency code (e.g. "INR"). */
export function useCurrency() {
  return useContext(CurrencyContext);
}

/** A formatter bound to the active household currency: `(amount) => "₹1,234.00"`. */
export function useFormatCurrency() {
  const currency = useContext(CurrencyContext);
  return useCallback((amount: number) => formatCurrency(amount, currency), [currency]);
}
