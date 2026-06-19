import { z } from "zod/v4";

/** One normalized expense row sent from the client importer. Mirrors the
 *  expense rules (amount ≤ 2dp, real ISO date, bounded text). */
export const importRowSchema = z.object({
  date: z.iso.date("Each row needs a valid date"),
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .max(100_000_000, "Amount is too large")
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
      "Amount can have at most 2 decimal places",
    ),
  description: z.string().min(1, "Description is required").max(200),
  notes: z.string().max(500).optional().default(""),
  categoryName: z.string().min(1).max(50),
  memberEmail: z.string().min(1), // a key (often an email; "" allowed via fallback bucket upstream)
});

/** How a distinct member-key resolves: to an existing member, or a new one. */
export const memberResolutionSchema = z
  .object({
    email: z.string().min(1),
    memberId: z.string().optional(),
    newName: z.string().trim().min(1).max(50).optional(),
  })
  .refine((r) => Boolean(r.memberId) || Boolean(r.newName), {
    message: "Each contributor must map to an existing or new member",
  });

export const importPayloadSchema = z.object({
  rows: z.array(importRowSchema).min(1, "Nothing to import").max(5000),
  memberResolutions: z.array(memberResolutionSchema).min(1),
});

export type ImportRow = z.infer<typeof importRowSchema>;
export type MemberResolution = z.infer<typeof memberResolutionSchema>;
export type ImportPayload = z.infer<typeof importPayloadSchema>;
