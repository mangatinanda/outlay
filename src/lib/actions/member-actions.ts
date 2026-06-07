"use server";

import { db } from "@/lib/db";
import { householdMembers, expenses } from "@/lib/db/schema";
import { memberSchema } from "@/lib/validators/member-schema";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createMember(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    role: formData.get("role") || "member",
  };

  const parsed = memberSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const household = await getDefaultHousehold();
  if (!household) return { error: "No household found" };

  await db.insert(householdMembers).values({
    id: createId(),
    householdId: household.id,
    name: parsed.data.name,
    role: parsed.data.role,
  });

  revalidatePath("/members");
  revalidatePath("/expenses");
  return { success: true };
}

export async function updateMember(id: string, formData: FormData) {
  const raw = {
    name: formData.get("name"),
    role: formData.get("role") || "member",
  };

  const parsed = memberSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  await db
    .update(householdMembers)
    .set({
      name: parsed.data.name,
      role: parsed.data.role,
    })
    .where(eq(householdMembers.id, id));

  revalidatePath("/members");
  return { success: true };
}

export async function deleteMember(id: string) {
  // Block deletion while the member still has expenses, otherwise those rows
  // would be orphaned (expenses.member_id references household_members.id).
  const linkedExpenses = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.memberId, id))
    .limit(1);

  if (linkedExpenses.length > 0) {
    return { error: "Cannot delete a member with existing expenses. Reassign their expenses first." };
  }

  await db.delete(householdMembers).where(eq(householdMembers.id, id));
  revalidatePath("/members");
  return { success: true };
}
