import { z } from "zod/v4";

export const expenseSchema = z.object({
  amount: z.coerce.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required").max(200),
  categoryId: z.string().min(1, "Category is required"),
  memberId: z.string().min(1, "Member is required"),
  date: z.string().min(1, "Date is required"),
  notes: z.string().max(500).optional(),
});

export type ExpenseFormData = z.infer<typeof expenseSchema>;
