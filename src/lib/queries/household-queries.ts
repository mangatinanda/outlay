import { db } from "@/lib/db";
import { households } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

export const HOUSEHOLD_COOKIE = "he_household";

async function firstHousehold() {
  const result = await db.select().from(households).limit(1);
  return result[0] ?? null;
}

/** The active household — from the `he_household` cookie, falling back to the first. */
export async function getCurrentHousehold() {
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
}

export async function listHouseholds() {
  return db.select().from(households).orderBy(households.name);
}
