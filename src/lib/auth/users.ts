import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull, sql } from "drizzle-orm";
import { isEmailAllowed } from "@/lib/allow-list";
import { db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { isOpenSignup, LIMITS } from "@/lib/limits";

/** Create the user row if absent (keyed on the unique email), else refresh
 *  name/image. Returns the stable users.id. */
export async function upsertUserByEmail(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    // Only set fields that were actually provided. An empty .set({}) makes
    // Drizzle throw "No values to set", which would break re-auth of an
    // existing user when the caller passes neither name nor image.
    const updates: { name?: string; image?: string } = {};
    if (input.name != null) updates.name = input.name;
    if (input.image != null) updates.image = input.image;
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, existing.id));
    }
    return existing.id;
  }

  const id = createId();
  await db.insert(users).values({
    id,
    email,
    name: input.name ?? email, // users.name is NOT NULL
    image: input.image ?? null,
  });
  return id;
}

/** Link any pending-invite rows (email set, userId null) to this user. */
export async function claimInvites(
  email: string,
  userId: string,
): Promise<void> {
  await db
    .update(householdMembers)
    .set({ userId })
    .where(
      and(
        eq(householdMembers.email, email.trim().toLowerCase()),
        isNull(householdMembers.userId),
      ),
    );
}

/** Total accounts (`users` rows). Used to enforce the global sign-up cap. */
async function userCount(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)` }).from(users);
  return row?.n ?? 0;
}

/** True if the email already has an account OR a membership/invite row, i.e.
 *  is "known" and may always return — even after open sign-up is later closed
 *  or the global cap is reached. */
async function isKnownEmail(email: string): Promise<boolean> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (user) return true;
  const [member] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.email, email))
    .limit(1);
  return !!member;
}

/**
 * Decide whether a Google email may sign in.
 *
 * 1. A known email (existing user, membership, or pending invite) always may.
 * 2. A brand-new email must pass the allow-list / wildcard / dev gate.
 * 3. Under open sign-up (`HOUSEHOLD_ALLOWED_EMAILS=*`) a new account is also
 *    bounded by the global `maxUsers` cap, so unbounded self-service
 *    registration can't fill the free-tier database.
 */
export async function canSignIn(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  if (await isKnownEmail(normalized)) return true;

  if (
    !isEmailAllowed(
      email,
      env.HOUSEHOLD_ALLOWED_EMAILS,
      process.env.NODE_ENV === "production",
    )
  ) {
    return false;
  }

  if (isOpenSignup(env.HOUSEHOLD_ALLOWED_EMAILS)) {
    return (await userCount()) < LIMITS.maxUsers;
  }
  return true;
}
