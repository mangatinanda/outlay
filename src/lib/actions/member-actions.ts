"use server";

import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { expenses, householdMembers } from "@/lib/db/schema";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { memberSchema } from "@/lib/validators/member-schema";
import { safeAction } from "./safe-action";

export const createMember = safeAction(
  "createMember",
  async (formData: FormData) => {
    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role") || "member",
    };

    const parsed = memberSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const email = parsed.data.email?.trim().toLowerCase() ?? null;
    if (email) {
      // A member's email is unique within a household (and is treated as a
      // sign-in invite), so reject a duplicate with a clear message.
      const [dupe] = await db
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, household.id),
            eq(householdMembers.email, email),
          ),
        )
        .limit(1);
      if (dupe) return { error: "A member with that email already exists." };
    }

    await db.insert(householdMembers).values({
      id: createId(),
      householdId: household.id,
      name: parsed.data.name,
      email,
      role: parsed.data.role,
    });

    revalidatePath("/members");
    revalidatePath("/expenses");
    return { success: true };
  },
);

export const updateMember = safeAction(
  "updateMember",
  async (id: string, formData: FormData) => {
    const raw = {
      name: formData.get("name"),
      email: formData.get("email"),
      role: formData.get("role") || "member",
    };

    const parsed = memberSchema.safeParse(raw);
    if (!parsed.success) {
      return { error: parsed.error.issues[0].message };
    }

    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };

    const email = parsed.data.email?.trim().toLowerCase() ?? null;
    if (email) {
      // Reject the email if a DIFFERENT member in this household already uses it.
      const sameEmail = await db
        .select({ id: householdMembers.id })
        .from(householdMembers)
        .where(
          and(
            eq(householdMembers.householdId, household.id),
            eq(householdMembers.email, email),
          ),
        );
      if (sameEmail.some((m) => m.id !== id)) {
        return { error: "A member with that email already exists." };
      }
    }

    const updated = await db
      .update(householdMembers)
      .set({
        name: parsed.data.name,
        email,
        role: parsed.data.role,
      })
      .where(
        and(
          eq(householdMembers.id, id),
          eq(householdMembers.householdId, household.id),
        ),
      )
      .returning({ id: householdMembers.id });
    if (updated.length === 0) return { error: "Member not found" };

    revalidatePath("/members");
    return { success: true };
  },
);

export const deleteMember = safeAction("deleteMember", async (id: string) => {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const [owned] = await db
    .select({ id: householdMembers.id })
    .from(householdMembers)
    .where(
      and(
        eq(householdMembers.id, id),
        eq(householdMembers.householdId, household.id),
      ),
    )
    .limit(1);
  if (!owned) return { error: "Member not found" };

  // Block deletion while the member still has expenses, otherwise those rows
  // would be orphaned (expenses.member_id references household_members.id).
  const linkedExpenses = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.memberId, id))
    .limit(1);

  if (linkedExpenses.length > 0) {
    return {
      error:
        "Cannot delete a member with existing expenses. Reassign their expenses first.",
    };
  }

  await db.delete(householdMembers).where(eq(householdMembers.id, id));
  revalidatePath("/members");
  return { success: true };
});
