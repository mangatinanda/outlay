"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getCurrentActor } from "@/lib/auth/actor";
import { db } from "@/lib/db";
import { householdMembers } from "@/lib/db/schema";
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

    await db.insert(householdMembers).values({
      id: createId(),
      householdId: household.id,
      email,
      name: email.split("@")[0],
      role: "member",
    });

    revalidatePath("/members");
    return { success: true };
  },
);
