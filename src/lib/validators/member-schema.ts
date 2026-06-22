import { z } from "zod/v4";

export const memberSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  // Optional: a member with no email is "attribution-only" — tracked but never
  // signs in. An empty form field ("") or null (absent FormData field) is treated
  // as absent, not invalid.
  email: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.email("Enter a valid email").optional(),
  ),
  role: z.enum(["admin", "member"]),
  // The form posts a hidden "true"/"false". An ABSENT field (other callers,
  // e.g. existing tests) must default to true — so map undefined/""/null → true
  // BEFORE coercing, otherwise `.default` never fires and absence becomes false.
  includeInSettleUp: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return true;
    return v === "true" || v === "on" || v === true;
  }, z.boolean()),
});

export type MemberFormData = z.infer<typeof memberSchema>;
