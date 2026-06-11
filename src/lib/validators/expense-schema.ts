import { z } from "zod/v4";

export const expenseSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Amount must be positive")
    .max(100_000_000, "Amount is too large")
    // Money is currently stored as a float (see audit task 2.1); at the
    // boundary we at least guarantee ≤ 2 decimal places. The epsilon absorbs
    // float noise like 0.07 * 100 === 7.000000000000001.
    .refine(
      (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
      "Amount can have at most 2 decimal places",
    ),
  description: z.string().min(1, "Description is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  memberId: z.string().min(1, "Member is required"),
  // The column is compared lexicographically (gte/lte) and parsed with
  // parseISO, so it must be a real YYYY-MM-DD calendar date.
  date: z.iso.date("Enter a valid date (YYYY-MM-DD)"),
  notes: z.string().max(500).optional(),
});

export type ExpenseFormData = z.infer<typeof expenseSchema>;
