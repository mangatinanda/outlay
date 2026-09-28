import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenseSplits, expenses, settlements } from "@/lib/db/schema";

export type LedgerReference = "expenses" | "splits" | "settlements";

/**
 * Which ledger table (if any) still references a `household_members` row.
 * `expenses.member_id`, `expense_splits.member_id` and
 * `settlements.{from,to}_member_id` all FK to it and libSQL enforces foreign
 * keys, so a referenced row cannot be deleted — callers must refuse (or
 * reassign) first instead of letting the DELETE throw.
 */
export async function memberLedgerReference(
  memberId: string,
): Promise<LedgerReference | null> {
  const [expense] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.memberId, memberId))
    .limit(1);
  if (expense) return "expenses";

  if (await memberHasSplitShares(memberId)) return "splits";

  const [settlement] = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(
      or(
        eq(settlements.fromMemberId, memberId),
        eq(settlements.toMemberId, memberId),
      ),
    )
    .limit(1);
  if (settlement) return "settlements";

  return null;
}

/** True while any expense is split by hand with a share for this member.
 *  Such a member can be neither deleted (FK) nor taken out of settle-up (their
 *  share would silently drop out of the balances). */
export async function memberHasSplitShares(memberId: string): Promise<boolean> {
  const [split] = await db
    .select({ id: expenseSplits.id })
    .from(expenseSplits)
    .where(eq(expenseSplits.memberId, memberId))
    .limit(1);
  return !!split;
}
