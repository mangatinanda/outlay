"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, settlements } from "@/lib/db/schema";
import { toMinorUnits } from "@/lib/money";
import { notify, type SettlementRecordedPayload } from "@/lib/notifications";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { RATE_LIMITED_MESSAGE, RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { settlementSchema } from "@/lib/validators/settlement-schema";
import { safeAction } from "./safe-action";

const NOT_PARTICIPANTS = "Both members must be in settle-up for this household";

function settlementFields(formData: FormData) {
  return {
    fromMemberId: formData.get("fromMemberId"),
    toMemberId: formData.get("toMemberId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || undefined,
  };
}

/** Members of THIS household, by id, with their settle-up flag. */
async function membersById(householdId: string) {
  const members = await db
    .select({
      id: householdMembers.id,
      name: householdMembers.name,
      userId: householdMembers.userId,
      includeInSettleUp: householdMembers.includeInSettleUp,
    })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  return new Map(members.map((m) => [m.id, m]));
}

export const createSettlement = safeAction(
  "createSettlement",
  async (formData: FormData) => {
    const parsed = settlementSchema.safeParse(settlementFields(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const rl = await rateLimit(`settlement:${household.id}`, {
      limit: RATE_LIMITS.expenseWritesPerMinute,
      windowSec: 60,
    });
    if (rl.limited) return { error: RATE_LIMITED_MESSAGE };

    // Both members must be participants (include_in_settle_up) of THIS household.
    const byId = await membersById(household.id);
    const from = byId.get(parsed.data.fromMemberId);
    const to = byId.get(parsed.data.toMemberId);
    if (!from?.includeInSettleUp || !to?.includeInSettleUp) {
      return { error: NOT_PARTICIPANTS };
    }

    await db.insert(settlements).values({
      id: createId(),
      householdId: household.id,
      fromMemberId: from.id,
      toMemberId: to.id,
      amountMinor: toMinorUnits(parsed.data.amount),
      date: parsed.data.date,
      note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
    });

    await logActivity({
      householdId: household.id,
      action: "settlement.create",
      summary: `settled ₹${parsed.data.amount} from ${from.name} to ${to.name}`,
    });

    // Notify the linked counterparty (never the actor, never unlinked rows).
    const actor = await getCurrentActor();
    const actorUserId = actor?.kind === "user" ? actor.userId : null;
    const recipients = [from.userId, to.userId].filter(
      (id): id is string => !!id && id !== actorUserId,
    );
    const payload: SettlementRecordedPayload = {
      amountMinor: toMinorUnits(parsed.data.amount),
      currency: household.currency,
      fromName: from.name,
      toName: to.name,
      householdName: household.name,
    };
    await notify({
      userIds: recipients,
      type: "settlement.recorded",
      householdId: household.id,
      payload: { ...payload },
    });

    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);

/**
 * Rewrite a recorded payment. Same rules as recording one, except that a
 * member who has since been toggled out of settle-up may STAY on the row —
 * otherwise its note, amount or date could never be corrected. Anyone newly
 * assigned must be a participant. No notification: the original recording
 * already told the counterparty, and an edit is a correction, not an event.
 */
export const updateSettlement = safeAction(
  "updateSettlement",
  async (id: string, formData: FormData) => {
    const parsed = settlementSchema.safeParse(settlementFields(formData));
    if (!parsed.success) return { error: parsed.error.issues[0].message };

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const rl = await rateLimit(`settlement:${household.id}`, {
      limit: RATE_LIMITS.expenseWritesPerMinute,
      windowSec: 60,
    });
    if (rl.limited) return { error: RATE_LIMITED_MESSAGE };

    // Scoped lookup first: a foreign id is indistinguishable from a missing one.
    const [stored] = await db
      .select({
        fromMemberId: settlements.fromMemberId,
        toMemberId: settlements.toMemberId,
      })
      .from(settlements)
      .where(
        and(eq(settlements.id, id), eq(settlements.householdId, household.id)),
      )
      .limit(1);
    if (!stored) return { error: "Settlement not found" };

    const byId = await membersById(household.id);
    const from = byId.get(parsed.data.fromMemberId);
    const to = byId.get(parsed.data.toMemberId);
    const allowed = (
      member: typeof from,
      storedId: string,
    ): member is NonNullable<typeof from> =>
      !!member && (member.includeInSettleUp || member.id === storedId);
    if (
      !allowed(from, stored.fromMemberId) ||
      !allowed(to, stored.toMemberId)
    ) {
      return { error: NOT_PARTICIPANTS };
    }

    await db
      .update(settlements)
      .set({
        fromMemberId: from.id,
        toMemberId: to.id,
        amountMinor: toMinorUnits(parsed.data.amount),
        date: parsed.data.date,
        note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
      })
      .where(
        and(eq(settlements.id, id), eq(settlements.householdId, household.id)),
      );

    await logActivity({
      householdId: household.id,
      action: "settlement.update",
      summary: `edited a settlement: ₹${parsed.data.amount} from ${from.name} to ${to.name}`,
    });

    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);

export const deleteSettlement = safeAction(
  "deleteSettlement",
  async (id: string) => {
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const deleted = await db
      .delete(settlements)
      .where(
        and(eq(settlements.id, id), eq(settlements.householdId, household.id)),
      )
      .returning({ id: settlements.id });
    if (deleted.length === 0) return { error: "Settlement not found" };

    await logActivity({
      householdId: household.id,
      action: "settlement.delete",
      summary: "deleted a settlement",
    });

    revalidatePath("/settle-up");
    revalidatePath("/activity");
    return { success: true };
  },
);
