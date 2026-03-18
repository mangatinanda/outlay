"use server";

import { db } from "@/lib/db";
import { categories, expenses } from "@/lib/db/schema";
import { categorySchema } from "@/lib/validators/category-schema";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function createCategory(formData: FormData) {
  const raw = {
    name: formData.get("name"),
    icon: formData.get("icon"),
    color: formData.get("color"),
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const household = await getDefaultHousehold();
  if (!household) return { error: "No household found" };

  await db.insert(categories).values({
    id: createId(),
    householdId: household.id,
    name: parsed.data.name,
    icon: parsed.data.icon,
    color: parsed.data.color,
  });

  revalidatePath("/categories");
  revalidatePath("/expenses");
  return { success: true };
}

export async function updateCategory(id: string, formData: FormData) {
  const raw = {
    name: formData.get("name"),
    icon: formData.get("icon"),
    color: formData.get("color"),
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  await db
    .update(categories)
    .set({
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
    })
    .where(eq(categories.id, id));

  revalidatePath("/categories");
  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteCategory(id: string) {
  // Check if category has expenses
  const expenseCount = await db
    .select({ count: eq(expenses.categoryId, id) })
    .from(expenses)
    .where(eq(expenses.categoryId, id));

  if (expenseCount.length > 0) {
    return { error: "Cannot delete category with existing expenses. Reassign expenses first." };
  }

  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/categories");
  return { success: true };
}
