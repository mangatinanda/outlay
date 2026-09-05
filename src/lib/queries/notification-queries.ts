import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, notifications } from "@/lib/db/schema";
import type { NotificationType } from "@/lib/notifications";

export type InviteState = "pending" | "accepted" | "gone";

export interface NotificationItemData {
  id: string;
  type: NotificationType;
  householdId: string | null;
  payload: Record<string, unknown>;
  readAt: number | null;
  createdAt: number;
  /** Only on invite.received — resolved live from household_members. */
  inviteState?: InviteState;
}

/** Unread notifications for the current user (0 for superadmin/signed-out). */
export async function getUnreadCount(): Promise<number> {
  const actor = await getCurrentActor();
  if (actor?.kind !== "user") return 0;
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, actor.userId), isNull(notifications.readAt)),
    );
  return row?.n ?? 0;
}

/** Newest-first notifications for the current user, payload parsed, invite
 *  state resolved live so items never go stale. */
export async function listNotifications(
  limit = 50,
): Promise<NotificationItemData[]> {
  const actor = await getCurrentActor();
  if (actor?.kind !== "user") return [];

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, actor.userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);

  const items: NotificationItemData[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    householdId: r.householdId,
    payload: safeParse(r.payload),
    readAt: r.readAt?.getTime() ?? null,
    createdAt: r.createdAt.getTime(),
  }));

  // Resolve invite state from the live invite rows in one batch.
  const memberIds = items
    .filter((i) => i.type === "invite.received")
    .map((i) => i.payload.memberId)
    .filter((v): v is string => typeof v === "string");
  const members = memberIds.length
    ? await db
        .select({ id: householdMembers.id, userId: householdMembers.userId })
        .from(householdMembers)
        .where(inArray(householdMembers.id, memberIds))
    : [];
  const byId = new Map(members.map((m) => [m.id, m]));
  for (const item of items) {
    if (item.type !== "invite.received") continue;
    const member = byId.get(item.payload.memberId as string);
    item.inviteState = !member
      ? "gone"
      : member.userId
        ? "accepted"
        : "pending";
  }
  return items;
}

function safeParse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}
