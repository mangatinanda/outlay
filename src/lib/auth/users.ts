import { createId } from "@paralleldrive/cuid2";
import { and, eq, isNull } from "drizzle-orm";
import { isEmailAllowed } from "@/lib/allow-list";
import { db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { env } from "@/lib/env";

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

/** A Google email may enter if it is allow-listed OR already has a
 *  membership/invite row. The allow-list bootstraps the owner; invites grant
 *  entry without editing env vars. */
export async function canSignIn(
  email: string | null | undefined,
): Promise<boolean> {
  if (
    isEmailAllowed(
      email,
      env.HOUSEHOLD_ALLOWED_EMAILS,
      process.env.NODE_ENV === "production",
    )
  ) {
    return true;
  }
  if (!email) return false;
  const [row] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(eq(householdMembers.email, email.trim().toLowerCase()))
    .limit(1);
  return !!row;
}
