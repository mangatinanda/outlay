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

export const acceptInvite = safeAction(
  "acceptInvite",
  async (memberId: string) => {
    const actor = await getCurrentActor();
    if (actor?.kind !== "user") return { error: "Not authenticated" };
    const email = actor.email.trim().toLowerCase();

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
      // row is redundant; drop it and treat as success.
      const causeMsg =
        err instanceof Error && err.cause instanceof Error
          ? err.cause.message
          : "";
      if (
        err instanceof Error &&
        (/UNIQUE/i.test(err.message) || /UNIQUE/i.test(causeMsg))
      ) {
        await db
          .delete(householdMembers)
          .where(
            and(
              eq(householdMembers.id, memberId),
              eq(householdMembers.email, email),
              isNull(householdMembers.userId),
            ),
          );
        return { success: true };
      }
      throw err;
    }
    if (claimed.length === 0) return { error: INVITE_GONE };
    const householdId = claimed[0].householdId;

    const [me] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, actor.userId))
      .limit(1);
    const payload: InviteAcceptedPayload = {
      accepterName: me?.name ?? actor.email,
      householdName: await householdName(householdId),
    };
    await notify({
      userIds: await adminUserIds(householdId, actor.userId),
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
    if (deleted.length === 0) return { error: INVITE_GONE };
    const householdId = deleted[0].householdId;

    const payload: InviteDeclinedPayload = {
      invitedEmail: actor.email,
      householdName: await householdName(householdId),
    };
    await notify({
      userIds: await adminUserIds(householdId, actor.userId),
      type: "invite.declined",
      householdId,
      payload: { ...payload },
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
