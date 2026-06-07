import { z } from "zod/v4";
import { CURRENCIES } from "@/lib/constants";

const CURRENCY_CODES = CURRENCIES.map((c) => c.code) as readonly string[];

export const currencySchema = z.object({
  currency: z
    .string()
    .refine((v) => CURRENCY_CODES.includes(v), "Unsupported currency"),
});
