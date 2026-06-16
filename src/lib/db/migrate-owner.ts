import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNotNull } from "drizzle-orm";
import { upsertUserByEmail } from "@/lib/auth/users";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";

export const OWNER_EMAIL = "mangatinanda@gmail.com";
const OWNER_NAME = "Nanda";

/** Idempotent: ensure the owner user exists and is an admin member of every
 *  household that has no auth-membership yet. Safe to re-run. */
export async function migrateOwner(): Promise<void> {
  const ownerId = await upsertUserByEmail({
    email: OWNER_EMAIL,
    name: OWNER_NAME,
  });

  const allHouseholds = await db.select({ id: households.id }).from(households);
  for (const h of allHouseholds) {
    const [hasAuthMember] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, h.id),
          isNotNull(householdMembers.userId),
        ),
      )
      .limit(1);
    if (hasAuthMember) continue;

    await db.insert(householdMembers).values({
      id: createId(),
      householdId: h.id,
      userId: ownerId,
      email: OWNER_EMAIL,
      name: OWNER_NAME,
      role: "admin",
    });
  }
}
