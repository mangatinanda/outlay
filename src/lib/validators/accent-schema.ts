import { z } from "zod/v4";
import { ACCENT_KEYS } from "@/lib/theme/palette";

// `null` is accepted explicitly so a household can reset to the Fresh Ledger
// default; non-empty strings must match one of the known palette keys.
export const accentSchema = z.object({
  accent: z.enum(ACCENT_KEYS).nullable(),
});

export type AccentFormData = z.infer<typeof accentSchema>;
