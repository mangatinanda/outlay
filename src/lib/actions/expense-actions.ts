"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actorLabelFor, logActivity } from "@/lib/activity";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { categories, expenses, householdMembers } from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { toMinorUnits } from "@/lib/money";
import { type ExpenseLargePayload, notify } from "@/lib/notifications";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { expenseSchema } from "@/lib/validators/expense-schema";
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
      and(
        eq(categories.id, categoryId),
        eq(categories.householdId, householdId),
      ),
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

export const createExpense = safeAction(
  "createExpense",
  async (formData: FormData) => {
    const raw = {
      amount: formData.get("amount"),
      description: formData.get("description"),
      categoryId: formData.get("categoryId"),
      memberId: formData.get("memberId"),
      date: formData.get("date"),
      notes: formData.get("notes") || undefined,
    };

    const parsed = expenseSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    // Throttle write bursts per household (bounds rate, not just total).
    const rl = await rateLimit(`expense:${household.id}`, {
      limit: RATE_LIMITS.expenseWritesPerMinute,
      windowSec: 60,
    });
    if (rl.limited) return { error: RATE_LIMITED_MESSAGE };

    const ownershipError = await checkOwnership(
      household.id,
      parsed.data.categoryId,
      parsed.data.memberId,
    );
    if (ownershipError) return { error: ownershipError };

    // Bound how many expenses a single household can accumulate.
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(expenses)
      .where(eq(expenses.householdId, household.id));
    if (n >= LIMITS.maxExpensesPerHousehold) {
      return {
        error: `This household has reached the limit of ${LIMITS.maxExpensesPerHousehold} expenses.`,
      };
    }

    const amountMinor = toMinorUnits(parsed.data.amount);

    // Threshold notification: only on CREATE (updates/imports never emit).
    // Recipients + labels are resolved BEFORE the insert: a failed lookup
    // must not turn a committed row into an {error} whose natural retry
    // creates a duplicate. After the insert only best-effort calls remain.
    const threshold = household.notifyExpenseOverMinor ?? 0;
    let largeExpense: {
      userIds: string[];
      payload: ExpenseLargePayload;
    } | null = null;
    if (threshold > 0 && amountMinor >= threshold) {
      const actor = await getCurrentActor();
      const actorUserId = actor?.kind === "user" ? actor.userId : null;
      const linked = await db
        .select({ userId: householdMembers.userId })
        .from(householdMembers)
        .where(eq(householdMembers.householdId, household.id));
      const { actorLabel } = await actorLabelFor(household.id);
      largeExpense = {
        userIds: linked
          .map((m) => m.userId)
          .filter((id): id is string => !!id && id !== actorUserId),
        payload: {
          amountMinor,
          currency: household.currency,
          description: parsed.data.description,
          actorLabel,
          householdName: household.name,
        },
      };
    }

    await db.insert(expenses).values({
      id: createId(),
      householdId: household.id,
      categoryId: parsed.data.categoryId,
      memberId: parsed.data.memberId,
      amountMinor,
      description: parsed.data.description,
      date: parsed.data.date,
      notes: parsed.data.notes || null,
    });

    await logActivity({
      householdId: household.id,
      action: "expense.create",
      summary: `added "${parsed.data.description}" ₹${parsed.data.amount}`,
    });

    if (largeExpense) {
      await notify({
        userIds: largeExpense.userIds,
        type: "expense.large",
        householdId: household.id,
        payload: { ...largeExpense.payload },
      });
    }

    revalidatePath("/dashboard");
    revalidatePath("/expenses");
    revalidatePath("/activity");
    return { success: true };
  },
);

export const updateExpense = safeAction(
  "updateExpense",
  async (id: string, formData: FormData) => {
    const raw = {
      amount: formData.get("amount"),
      description: formData.get("description"),
      categoryId: formData.get("categoryId"),
      memberId: formData.get("memberId"),
      date: formData.get("date"),
      notes: formData.get("notes") || undefined,
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
        amountMinor: toMinorUnits(parsed.data.amount),
        description: parsed.data.description,
        date: parsed.data.date,
        notes: parsed.data.notes || null,
        updatedAt: new Date(),
      })
      .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id)))
      .returning({ id: expenses.id });
    if (updated.length === 0) return { error: "Expense not found" };

    await logActivity({
      householdId: household.id,
      action: "expense.update",
      summary: `edited "${parsed.data.description}"`,
    });
    revalidatePath("/dashboard");
    revalidatePath("/expenses");
    revalidatePath("/activity");
    return { success: true };
  },
);

export const deleteExpense = safeAction("deleteExpense", async (id: string) => {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id)))
    .returning({ id: expenses.id });
  if (deleted.length === 0) return { error: "Expense not found" };

  await logActivity({
    householdId: household.id,
    action: "expense.delete",
    summary: "deleted an expense",
  });
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  revalidatePath("/activity");
  return { success: true };
});
