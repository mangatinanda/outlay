import { and, eq } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, households } from "@/lib/db/schema";

export async function isMember(
  userId: string,
  householdId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.userId, userId),
        eq(householdMembers.householdId, householdId),
      ),
    )
    .limit(1);
  return !!row;
}

/** Households the user belongs to (auth membership = userId set), as flat
 *  household rows ordered by name. */
export async function userHouseholds(userId: string) {
  return db
    .select({
      id: households.id,
      name: households.name,
      currency: households.currency,
      createdAt: households.createdAt,
    })
    .from(households)
    .innerJoin(
      householdMembers,
      eq(householdMembers.householdId, households.id),
    )
    .where(eq(householdMembers.userId, userId))
    .orderBy(households.name);
}

/** Throws unless the actor may access the household. Superadmin always may. */
export async function assertCanAccessHousehold(
  actor: Actor,
  householdId: string,
): Promise<void> {
  if (actor.kind === "superadmin") return;
  if (await isMember(actor.userId, householdId)) return;
  throw new Error("Forbidden");
}
