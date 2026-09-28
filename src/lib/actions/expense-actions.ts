"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actorLabelFor, logActivity } from "@/lib/activity";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import {
  categories,
  expenseSplits,
  expenses,
  householdMembers,
} from "@/lib/db/schema";
import { LIMITS } from "@/lib/limits";
import { toMinorUnits } from "@/lib/money";
import { type ExpenseLargePayload, notify } from "@/lib/notifications";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { expenseSchema } from "@/lib/validators/expense-schema";
import {
  parseSplitsField,
  type SplitInput,
} from "@/lib/validators/expense-splits-schema";
import { safeAction } from "./safe-action";

const SPLIT_MEMBERS_ERROR =
  "Everyone in a split must be in settle-up for this household";

function expenseFields(formData: FormData) {
  return {
    amount: formData.get("amount"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    memberId: formData.get("memberId"),
    date: formData.get("date"),
    notes: formData.get("notes") || undefined,
  };
}

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

/**
 * Every split member must be a settle-up participant of THIS household: the
 * balance math only charges participants, so a share for anyone else would
 * silently vanish (and a foreign member id must never be stored).
 */
async function checkSplitMembers(
  householdId: string,
  splits: SplitInput[],
): Promise<string | null> {
  const rows = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.includeInSettleUp, true),
        inArray(
          householdMembers.id,
          splits.map((s) => s.memberId),
        ),
      ),
    );
  return rows.length === splits.length ? null : SPLIT_MEMBERS_ERROR;
}

function splitRows(expenseId: string, splits: SplitInput[]) {
  return splits.map((s) => ({
    id: createId(),
    expenseId,
    memberId: s.memberId,
    shareMinor: s.shareMinor,
  }));
}

export const createExpense = safeAction(
  "createExpense",
  async (formData: FormData) => {
    const parsed = expenseSchema.safeParse(expenseFields(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }
    const amountMinor = toMinorUnits(parsed.data.amount);
    const split = parseSplitsField(formData.get("splits"), amountMinor);
    if ("error" in split) return { error: split.error };

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
    if (split.splits) {
      const splitError = await checkSplitMembers(household.id, split.splits);
      if (splitError) return { error: splitError };
    }

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

    const expenseId = createId();
    const insertExpense = db.insert(expenses).values({
      id: expenseId,
      householdId: household.id,
      categoryId: parsed.data.categoryId,
      memberId: parsed.data.memberId,
      amountMinor,
      description: parsed.data.description,
      date: parsed.data.date,
      notes: parsed.data.notes || null,
    });
    // The expense and its shares land together or not at all.
    if (split.splits) {
      await db.batch([
        insertExpense,
        db.insert(expenseSplits).values(splitRows(expenseId, split.splits)),
      ]);
    } else {
      await insertExpense;
    }

    await logActivity({
      householdId: household.id,
      action: "expense.create",
      summary: `added "${parsed.data.description}" ₹${parsed.data.amount}${split.splits ? " (custom split)" : ""}`,
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
    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);

export const updateExpense = safeAction(
  "updateExpense",
  async (id: string, formData: FormData) => {
    const parsed = expenseSchema.safeParse(expenseFields(formData));
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }
    const amountMinor = toMinorUnits(parsed.data.amount);
    const split = parseSplitsField(formData.get("splits"), amountMinor);
    if ("error" in split) return { error: split.error };

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const ownershipError = await checkOwnership(
      household.id,
      parsed.data.categoryId,
      parsed.data.memberId,
    );
    if (ownershipError) return { error: ownershipError };
    if (split.splits) {
      const splitError = await checkSplitMembers(household.id, split.splits);
      if (splitError) return { error: splitError };
    }

    // Scoped existence check up front: the batch below can't report "no row".
    const [existing] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id)))
      .limit(1);
    if (!existing) return { error: "Expense not found" };

    const updateRow = db
      .update(expenses)
      .set({
        categoryId: parsed.data.categoryId,
        memberId: parsed.data.memberId,
        amountMinor,
        description: parsed.data.description,
        date: parsed.data.date,
        notes: parsed.data.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(expenses.id, id));
    // Shares are replaced wholesale: "Equally" clears them, "Custom" rewrites.
    const clearShares = db
      .delete(expenseSplits)
      .where(eq(expenseSplits.expenseId, id));
    if (split.splits) {
      await db.batch([
        updateRow,
        clearShares,
        db.insert(expenseSplits).values(splitRows(id, split.splits)),
      ]);
    } else {
      await db.batch([updateRow, clearShares]);
    }

    await logActivity({
      householdId: household.id,
      action: "expense.update",
      summary: `edited "${parsed.data.description}"${split.splits ? " (custom split)" : ""}`,
    });
    revalidatePath("/dashboard");
    revalidatePath("/expenses");
    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);

export const deleteExpense = safeAction("deleteExpense", async (id: string) => {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.householdId, household.id)))
    .limit(1);
  if (!existing) return { error: "Expense not found" };

  // Shares reference the expense (FK), so they go first — atomically.
  await db.batch([
    db.delete(expenseSplits).where(eq(expenseSplits.expenseId, id)),
    db.delete(expenses).where(eq(expenses.id, id)),
  ]);

  await logActivity({
    householdId: household.id,
    action: "expense.delete",
    summary: "deleted an expense",
  });
  revalidatePath("/dashboard");
  revalidatePath("/expenses");
  revalidatePath("/settle-up");
  revalidatePath("/activity");
  return { success: true };
});
