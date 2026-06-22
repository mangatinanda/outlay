import { z } from "zod/v4";

export const settlementSchema = z
  .object({
    fromMemberId: z.string().min(1, "Who is paying?"),
    toMemberId: z.string().min(1, "Who is being paid?"),
    amount: z.coerce
      .number()
      .positive("Amount must be positive")
      .max(100_000_000, "Amount is too large")
      .refine(
        (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
        "Amount can have at most 2 decimal places",
      ),
    date: z.iso.date("Enter a valid date (YYYY-MM-DD)"),
    note: z.string().max(500).optional(),
  })
  .refine((d) => d.fromMemberId !== d.toMemberId, {
    message: "A member can't settle with themselves",
    path: ["toMemberId"],
  });

export type SettlementFormData = z.infer<typeof settlementSchema>;
