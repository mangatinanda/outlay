import { z } from "zod/v4";

export const memberSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  // Optional: a member with no email is "attribution-only" — tracked but never
  // signs in. An empty form field ("") is treated as absent, not invalid.
  email: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.email("Enter a valid email").optional(),
  ),
  role: z.enum(["admin", "member"]),
});

export type MemberFormData = z.infer<typeof memberSchema>;
