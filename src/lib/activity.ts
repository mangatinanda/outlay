import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { activity, householdMembers, users } from "@/lib/db/schema";

export type ActivityAction =
  | "expense.create"
  | "expense.update"
  | "expense.delete"
  | "expense.import"
  | "settlement.create"
  | "settlement.delete"
  | "member.create"
  | "member.update"
  | "member.delete"
  | "category.create"
  | "category.update"
  | "category.delete"
  | "household.create"
  | "household.rename"
  | "household.delete";

/** Resolve a display name for the acting principal in this household. */
export async function actorLabelFor(
  householdId: string,
): Promise<{ actorUserId: string | null; actorLabel: string }> {
  const actor = await getCurrentActor();
  if (!actor || actor.kind === "superadmin") {
    return { actorUserId: null, actorLabel: "Admin" };
  }
  const [member] = await db
    .select({ name: householdMembers.name })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.userId, actor.userId),
      ),
    )
    .limit(1);
  if (member) return { actorUserId: actor.userId, actorLabel: member.name };
  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  return { actorUserId: actor.userId, actorLabel: u?.name ?? actor.email };
}

/**
 * Append one row to the household activity feed. BEST-EFFORT: any failure is
 * logged and swallowed so it never breaks the caller's mutation. Call AFTER
 * the mutation succeeds, before revalidate.
 */
export async function logActivity(input: {
  householdId: string;
  action: ActivityAction;
  summary: string;
  metadata?: unknown;
}): Promise<void> {
  try {
    const { actorUserId, actorLabel } = await actorLabelFor(input.householdId);
    await db.insert(activity).values({
      id: createId(),
      householdId: input.householdId,
      actorUserId,
      actorLabel,
      action: input.action,
      summary: input.summary,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });
  } catch (err) {
    console.error("[logActivity] failed (ignored):", err);
  }
}
