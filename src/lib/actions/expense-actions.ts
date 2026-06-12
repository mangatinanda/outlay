"use server";

import { db } from "@/lib/db";
import { expenses, categories, householdMembers } from "@/lib/db/schema";
import { expenseSchema } from "@/lib/validators/expense-schema";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { safeAction } from "./safe-action";

/**
 * Returns an error message unless categoryId AND memberId both belong to the
 * given household. Prevents cross-household references (an expense in
 * household A pointing at household B's category corrupts both households'
 * reports).
 */
async function checkOwnership(
  householdId: string,
  categoryId: string,
  memberId: string,
): Promise<string | null> {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.id, categoryId), eq(categories.householdId, householdId)),
    )
    .limit(1);
  if (!category) return "Category not found in this household";

  const [member] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, memberId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);
  if (!member) return "Member not found in this household";

  return null;
}

export const createExpense = safeAction("createExpense", async (formData: FormData) => {
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

  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const ownershipError = await checkOwnership(
    household.id,
    parsed.data.categoryId,
    parsed.data.memberId,
  );
  if (ownershipError) return { error: ownershipError };

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
});

export const updateExpense = safeAction("updateExpense", async (id: string, formData: FormData) => {
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

  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const ownershipError = await checkOwnership(
    household.id,
    parsed.data.categoryId,
    parsed.data.memberId,
  );
  if (ownershipError) return { error: ownershipError };

  const updated = await db
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
    .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id)))
    .returning({ id: expenses.id });
  if (updated.length === 0) return { error: "Expense not found" };

  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  return { success: true };
});

export const deleteExpense = safeAction("deleteExpense", async (id: string) => {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id)))
    .returning({ id: expenses.id });
  if (deleted.length === 0) return { error: "Expense not found" };

  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  return { success: true };
});
