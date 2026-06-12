import { cache } from "react";
import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

export const HOUSEHOLD_COOKIE = "he_household";

async function firstHousehold() {
  const result = await db.select().from(households).limit(1);
  return result[0] ?? null;
}

/**
 * The active household — from the `he_household` cookie, falling back to the
 * first. Wrapped in React cache() so the layout, page, and any actions in the
 * same request share one DB round-trip instead of re-querying per call site.
 */
export const getCurrentHousehold = cache(async () => {
  const id = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  if (id) {
    const found = await db
      .select()
      .from(households)
      .where(eq(households.id, id))
      .limit(1);
    if (found[0]) return found[0];
  }
  return firstHousehold();
});

export const listHouseholds = cache(async () => {
  return db.select().from(households).orderBy(households.name);
});
