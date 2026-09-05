import { eq, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, settlements } from "@/lib/db/schema";

export type LedgerReference = "expenses" | "settlements";

/**
 * Which ledger table (if any) still references a `household_members` row.
 * `expenses.member_id` and `settlements.{from,to}_member_id` both FK to it and
 * libSQL enforces foreign keys, so a referenced row cannot be deleted —
 * callers must refuse (or reassign) first instead of letting the DELETE throw.
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
