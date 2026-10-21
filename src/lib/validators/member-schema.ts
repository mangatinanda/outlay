import { z } from "zod/v4";

/** NPCI VPA shape: identifier@handle (handle = PSP, letters first). */
export const UPI_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]{0,254}@[a-z][a-z0-9]{1,63}$/;
export const UPI_ID_ERROR = "Enter a valid UPI ID, like name@bank";

export const memberSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  // Optional: a member with no email is "attribution-only" — tracked but never
  // signs in. An empty form field ("") or null (absent FormData field) is treated
  // as absent, not invalid.
  email: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.email("Enter a valid email").optional(),
  ),
  // Optional VPA for "Pay via UPI" on settle-up. Stored trimmed + lowercase so
  // the deep link / QR is deterministic; blank means none.
  upiId: z.preprocess((v) => {
    if (v === undefined || v === null) return undefined;
    const s = String(v).trim().toLowerCase();
    return s === "" ? undefined : s;
  }, z.string().regex(UPI_ID_PATTERN, UPI_ID_ERROR).optional()),
  role: z.enum(["admin", "member"]),
  // The form posts a hidden "true"/"false". An ABSENT field (other callers,
  // e.g. existing tests) must default to true — so map undefined/""/null → true
  // BEFORE coercing, otherwise `.default` never fires and absence becomes false.
  includeInSettleUp: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return true;
    return v === "true" || v === "on" || v === true;
  }, z.boolean()),
  // Same shape: absent → true (offered as a payer by default).
  showInPaidBy: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return true;
    return v === "true" || v === "on" || v === true;
  }, z.boolean()),
});

export type MemberFormData = z.infer<typeof memberSchema>;
