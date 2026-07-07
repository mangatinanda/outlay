import { createId } from "@paralleldrive/cuid2";
import { eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export type NotificationType =
  | "invite.received"
  | "invite.accepted"
  | "invite.declined"
  | "settlement.recorded"
  | "expense.large";

export interface InviteReceivedPayload {
  memberId: string;
  householdName: string;
  invitedBy: string;
}
export interface InviteAcceptedPayload {
  accepterName: string;
  householdName: string;
}
export interface InviteDeclinedPayload {
  invitedEmail: string;
  householdName: string;
}
export interface SettlementRecordedPayload {
  amountMinor: number;
  currency: string;
  fromName: string;
  toName: string;
  householdName: string;
}
export interface ExpenseLargePayload {
  amountMinor: number;
  currency: string;
  description: string;
  actorLabel: string;
  householdName: string;
}

/** Keep only this many notifications per user (pruned on write). */
export const NOTIFICATIONS_KEEP = 100;

/**
 * Fan a notification out to users. BEST-EFFORT: any failure is logged and
 * swallowed so it never breaks the caller's mutation (same posture as
 * logActivity). Call AFTER the mutation succeeds, before revalidatePath().
 * This is the single emission point — v2 Web Push dispatch slots in here.
 */
export async function notify(input: {
  userIds: string[];
  type: NotificationType;
  householdId?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    const userIds = [...new Set(input.userIds)];
    if (userIds.length === 0) return;
    const payload = JSON.stringify(input.payload);
    await db.insert(notifications).values(
      userIds.map((userId) => ({
        id: createId(),
        userId,
        type: input.type,
        householdId: input.householdId ?? null,
        payload,
      })),
    );
    for (const userId of userIds) {
      const keep = db
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(
          sql`${notifications.createdAt} DESC`,
          sql`${notifications.id} DESC`,
        )
        .limit(NOTIFICATIONS_KEEP);
      await db
        .delete(notifications)
        .where(
          sql`${notifications.userId} = ${userId} AND ${notInArray(notifications.id, keep)}`,
        );
    }
  } catch (err) {
    console.error("[notify] failed (ignored):", err);
  }
}
