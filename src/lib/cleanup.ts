import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  categories,
  expenses,
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { parseLimit } from "@/lib/limits";

/** Days an account may sit with zero activity before cleanup removes it. */
export const CLEANUP_RETENTION_DAYS = parseLimit(
  env.CLEANUP_RETENTION_DAYS,
  30,
);

export interface CleanupResult {
  deletedUsers: number;
  deletedHouseholds: number;
}

/**
 * Reclaim free-tier storage from abandoned accounts. Deliberately
 * conservative — it only removes data that is provably empty:
 *
 * - A user is "abandoned" iff created before the retention cutoff AND none of
 *   the households they belong to contain ANY expense (counting the WHOLE
 *   household, not just rows attributed to the user's own member — otherwise
 *   the sole owner of a household whose expenses are attributed to
 *   attribution-only members like "Amma" would be deleted, orphaning the data).
 *   Such users' membership rows and the user row are deleted atomically.
 * - A household is removed only if, afterwards, it has zero expenses AND zero
 *   remaining auth-members. A household with ANY expense or ANY live member is
 *   never touched, so shared data can't be lost.
 *
 * `now` / `retentionDays` are injectable for tests.
 */
export async function cleanupAbandonedAccounts(
  opts: { now?: number; retentionDays?: number } = {},
): Promise<CleanupResult> {
  const now = opts.now ?? Date.now();
  const retentionDays = opts.retentionDays ?? CLEANUP_RETENTION_DAYS;
  const cutoff = new Date(now - retentionDays * 86_400_000);

  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(lt(users.createdAt, cutoff));
  if (candidates.length === 0) return { deletedUsers: 0, deletedHouseholds: 0 };

  let deletedUsers = 0;
  const affectedHouseholds = new Set<string>();

  for (const u of candidates) {
    const memberships = await db
      .select({ householdId: householdMembers.householdId })
      .from(householdMembers)
      .where(eq(householdMembers.userId, u.id));
    const householdIds = memberships.map((m) => m.householdId);

    // Does ANY household this user belongs to hold expenses? (Whole-household
    // count, so an owner whose data lives on attribution-only members is kept.)
    let belongsToActiveHousehold = false;
    if (householdIds.length > 0) {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(expenses)
        .where(inArray(expenses.householdId, householdIds));
      belongsToActiveHousehold = n > 0;
    }
    if (belongsToActiveHousehold) continue; // active household — keep the user

    for (const hid of householdIds) affectedHouseholds.add(hid);
    // Delete every row that FKs to the user, then the user — atomically.
    await db.batch([
      db.delete(notifications).where(eq(notifications.userId, u.id)),
      db.delete(householdMembers).where(eq(householdMembers.userId, u.id)),
      db.delete(users).where(eq(users.id, u.id)),
    ]);
    deletedUsers++;
  }

  // Remove households left provably empty by the deletions above.
  let deletedHouseholds = 0;
  for (const hid of affectedHouseholds) {
    const [{ exp }] = await db
      .select({ exp: sql<number>`count(*)` })
      .from(expenses)
      .where(eq(expenses.householdId, hid));
    if (exp > 0) continue;

    const [{ live }] = await db
      .select({ live: sql<number>`count(*)` })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, hid),
          isNotNull(householdMembers.userId),
        ),
      );
    if (live > 0) continue;

    // Delete children then the household atomically (FK order).
    await db.batch([
      db.delete(categories).where(eq(categories.householdId, hid)),
      db.delete(householdMembers).where(eq(householdMembers.householdId, hid)),
      db.delete(households).where(eq(households.id, hid)),
    ]);
    deletedHouseholds++;
  }

  return { deletedUsers, deletedHouseholds };
}
