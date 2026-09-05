import { z } from "zod/v4";
import { CURRENCIES } from "@/lib/constants";

const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as readonly string[];

export const currencySchema = z.object({
  currency: z
    .string()
    .refine((v) => CURRENCY_CODES.includes(v), "Unsupported currency"),
});

/** Major units; "" = off. Stored as minor units (null when off). */
export const expenseNotifyThresholdSchema = z.object({
  amount: z.union([
    z.literal(""),
    z.coerce.number().min(0, "Must be 0 or more").max(100_000_000),
  ]),
});
