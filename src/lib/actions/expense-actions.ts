"use server";

import { db } from "@/lib/db";
import { expenses } from "@/lib/db/schema";
import { expenseSchema } from "@/lib/validators/expense-schema";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createExpense(formData: FormData) {
  const raw = {
    amount: formData.get("amount"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    memberId: formData.get("memberId"),
    date: formData.get("date"),
    notes: formData.get("notes"),
  };

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const household = await getDefaultHousehold();
  if (!household) return { error: "No household found" };

  await db.insert(expenses).values({
    id: createId(),
    householdId: household.id,
    categoryId: parsed.data.categoryId,
    memberId: parsed.data.memberId,
    amount: parsed.data.amount,
    description: parsed.data.description,
    date: parsed.data.date,
    notes: parsed.data.notes || null,
  });

  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  return { success: true };
}

export async function updateExpense(id: string, formData: FormData) {
  const raw = {
    amount: formData.get("amount"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    memberId: formData.get("memberId"),
    date: formData.get("date"),
    notes: formData.get("notes"),
  };

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  await db
    .update(expenses)
    .set({
      categoryId: parsed.data.categoryId,
      memberId: parsed.data.memberId,
      amount: parsed.data.amount,
      description: parsed.data.description,
      date: parsed.data.date,
      notes: parsed.data.notes || null,
      updatedAt: new Date(),
    })
    .where(eq(expenses.id, id));

  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteExpense(id: string) {
  await db.delete(expenses).where(eq(expenses.id, id));
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  return { success: true };
}
