"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { actorLabelFor, logActivity } from "@/lib/activity";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers, users } from "@/lib/db/schema";
import { type InviteReceivedPayload, notify } from "@/lib/notifications";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { inviteSchema } from "@/lib/validators/invite-schema";
import { safeAction } from "./safe-action";

export const inviteToHousehold = safeAction(
  "inviteToHousehold",
  async (formData: FormData) => {
    const parsed = inviteSchema.safeParse({ email: formData.get("email") });
    if (!parsed.success) return { error: parsed.error.issues[0].message };
    const email = parsed.data.email.trim().toLowerCase();

    const actor = await getCurrentActor();
    if (!actor) return { error: "Not authenticated" };
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    // Only a superadmin or an admin member of THIS household may invite.
    if (actor.kind === "user") {
      const [me] = await db
        .select({ role: householdMembers.role })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, household.id),
            eq(householdMembers.userId, actor.userId),
          ),
        )
        .limit(1);
      if (me?.role !== "admin") {
        return { error: "Only an admin can invite members" };
      }
    }

    const [dup] = await db
      .select({ id: householdMembers.id })
      .from(householdMembers)
      .where(
        and(
          eq(householdMembers.householdId, household.id),
          eq(householdMembers.email, email),
        ),
      )
      .limit(1);
    if (dup) return { error: "That email is already invited" };

    const memberId = createId();
    await db.insert(householdMembers).values({
      id: memberId,
      householdId: household.id,
      email,
      name: email.split("@")[0],
      role: "member",
    });

    // In-app notification if the invited email already has an account
    // (brand-new emails have nobody to notify; they claim at first sign-in).
    const [invitee] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (invitee) {
      const { actorLabel } = await actorLabelFor(household.id);
      const payload: InviteReceivedPayload = {
        memberId,
        householdName: household.name,
        invitedBy: actorLabel,
      };
      await notify({
        userIds: [invitee.id],
        type: "invite.received",
        householdId: household.id,
        payload: { ...payload },
      });
    }

    await logActivity({
      householdId: household.id,
      action: "member.create",
      summary: `invited ${email}`,
    });
    revalidatePath("/members");
    return { success: true };
  },
);
