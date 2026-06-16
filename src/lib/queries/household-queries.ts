import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getCurrentActor } from "@/lib/auth/actor";
import { isMember, userHouseholds } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";

export const HOUSEHOLD_COOKIE = "he_household";

async function householdById(id: string) {
  const [found] = await db
    .select()
    .from(households)
    .where(eq(households.id, id))
    .limit(1);
  return found ?? null;
}

/**
 * The active household. Superadmin resolves any household (cookie, else the
 * first overall). A user resolves the cookie household only if they are a
 * member, else their first membership, else null. Wrapped in cache() so one
 * request shares a single resolution.
 */
export const getCurrentHousehold = cache(async () => {
  const actor = await getCurrentActor();
  if (!actor) return null;

  const id = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;

  if (actor.kind === "superadmin") {
    if (id) {
      const found = await householdById(id);
      if (found) return found;
    }
    const [first] = await db.select().from(households).limit(1);
    return first ?? null;
  }

  if (id && (await isMember(actor.userId, id))) {
    const found = await householdById(id);
    if (found) return found;
  }
  const mine = await userHouseholds(actor.userId);
  return mine[0] ?? null;
});

export const listHouseholds = cache(async () => {
  const actor = await getCurrentActor();
  if (!actor) return [];
  if (actor.kind === "superadmin") {
    return db.select().from(households).orderBy(households.name);
  }
  return userHouseholds(actor.userId);
});
