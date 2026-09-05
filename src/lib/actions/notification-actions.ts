"use server";

import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import {
  householdMembers,
  households,
  notifications,
  users,
} from "@/lib/db/schema";
import {
  type InviteAcceptedPayload,
  type InviteDeclinedPayload,
  notify,
} from "@/lib/notifications";
import { memberLedgerReference } from "@/lib/queries/member-ledger";
import { listNotifications } from "@/lib/queries/notification-queries";
import { safeAction } from "./safe-action";

const INVITE_GONE = "Invite no longer available";

/** Linked admins of a household, excluding one user (the actor). */
async function adminUserIds(
  householdId: string,
  excludeUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: householdMembers.userId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.householdId, householdId),
        eq(householdMembers.role, "admin"),
        ne(householdMembers.userId, excludeUserId),
      ),
    );
  return rows
    .map((r) => r.userId)
    .filter((v): v is string => typeof v === "string");
}

async function householdName(id: string): Promise<string> {
  const [row] = await db
    .select({ name: households.name })
    .from(households)
    .where(eq(households.id, id))
    .limit(1);
  return row?.name ?? "a household";
}

/** The caller's OWN pending invite row, or null (fail closed: a foreign or
 *  already-claimed id is indistinguishable from a missing one). */
async function pendingInviteFor(memberId: string, email: string) {
  const [row] = await db
    .select({ householdId: householdMembers.householdId })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, memberId),
        eq(householdMembers.email, email),
        isNull(householdMembers.userId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export const acceptInvite = safeAction(
  "acceptInvite",
  async (memberId: string) => {
    const actor = await getCurrentActor();
    if (actor?.kind !== "user") return { error: "Not authenticated" };
    const email = actor.email.trim().toLowerCase();

    const invite = await pendingInviteFor(memberId, email);
    if (!invite) return { error: INVITE_GONE };
    const { householdId } = invite;

    // Everything the post-claim side effects need is read BEFORE the claim,
    // so a transient read failure can't turn a committed membership into an
    // {error} that the UI reports as "not accepted" (and that skips
    // revalidation). After the claim only best-effort calls remain.
    const [me] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    const payload: InviteAcceptedPayload = {
      accepterName: me?.name ?? actor.email,
      householdName: await householdName(householdId),
    };
    const admins = await adminUserIds(householdId, actor.userId);

    // Guarded claim: only YOUR pending invite is claimable (fail closed).
    let claimed: { householdId: string }[];
    try {
      claimed = await db
        .update(householdMembers)
        .set({ userId: actor.userId })
        .where(
          and(
            eq(householdMembers.id, memberId),
            eq(householdMembers.email, email),
            isNull(householdMembers.userId),
          ),
        )
        .returning({ householdId: householdMembers.householdId });
    } catch (err) {
      // (householdId, userId) unique index: already a member — the pending
      // row is redundant.
      const causeMsg =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : "";
      const isUnique =
        err instanceof Error &&
        (/UNIQUE/i.test(err.message) || /UNIQUE/i.test(causeMsg));
      if (!isUnique) throw err;
      // An admin may already have attributed expenses/settlements to the
      // duplicate row; FKs are enforced, so it can only be dropped when
      // nothing references it.
      if (await memberLedgerReference(memberId)) {
        return {
          error:
            "You're already a member of this household. Ask an admin to reassign this invite's expenses and remove it.",
        };
      }
      await db
        .delete(householdMembers)
        .where(
          and(
            eq(householdMembers.id, memberId),
            eq(householdMembers.email, email),
            isNull(householdMembers.userId),
          ),
        );
      revalidatePath("/", "layout");
      return { success: true };
    }
    if (claimed.length === 0) return { error: INVITE_GONE }; // raced

    await notify({
      userIds: admins,
      type: "invite.accepted",
      householdId,
      payload: { ...payload },
    });
    await logActivity({
      householdId,
      action: "member.update",
      summary: "accepted an invite",
    });
    // New membership changes the switcher + every scoped list.
    revalidatePath("/", "layout");
    return { success: true };
  },
);

export const declineInvite = safeAction(
  "declineInvite",
  async (memberId: string) => {
    const actor = await getCurrentActor();
    if (actor?.kind !== "user") return { error: "Not authenticated" };
    const email = actor.email.trim().toLowerCase();

    const invite = await pendingInviteFor(memberId, email);
    if (!invite) return { error: INVITE_GONE };
    const { householdId } = invite;

    // Admins can pick a pending invitee as a payer, so ledger rows may
    // already reference this row; FKs are enforced, so refuse instead of
    // letting the DELETE throw (same guard as deleteMember).
    const ref = await memberLedgerReference(memberId);
    if (ref === "expenses") {
      return {
        error:
          "You can't decline yet: expenses in this household are attributed to you. Ask an admin to reassign them first.",
      };
    }
    if (ref === "settlements") {
      return {
        error:
          "You can't decline yet: a settlement in this household references you. Ask an admin to delete it first.",
      };
    }

    // Read what the side effects need before the mutation (see acceptInvite).
    const payload: InviteDeclinedPayload = {
      invitedEmail: actor.email,
      householdName: await householdName(householdId),
    };
    const admins = await adminUserIds(householdId, actor.userId);

    const deleted = await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.id, memberId),
          eq(householdMembers.email, email),
          isNull(householdMembers.userId),
        ),
      )
      .returning({ householdId: householdMembers.householdId });
    if (deleted.length === 0) return { error: INVITE_GONE }; // raced

    await notify({
      userIds: admins,
      type: "invite.declined",
      householdId,
      payload: { ...payload },
    });
    await logActivity({
      householdId,
      action: "member.delete",
      summary: "declined an invite",
    });
    revalidatePath("/members");
    return { success: true };
  },
);

export const markAllNotificationsRead = safeAction(
  "markAllNotificationsRead",
  async () => {
    const actor = await getCurrentActor();
    if (actor?.kind !== "user") return { error: "Not authenticated" };
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, actor.userId),
          isNull(notifications.readAt),
        ),
      );
    return { success: true };
  },
);

/** Dropdown fetch (same client-read pattern as loadMoreActivity). */
export const loadNotifications = safeAction("loadNotifications", async () => {
  return { success: true as const, items: await listNotifications(10) };
});
