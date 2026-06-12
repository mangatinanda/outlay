"use server";

import { db } from "@/lib/db";
import { categories, expenses } from "@/lib/db/schema";
import { categorySchema } from "@/lib/validators/category-schema";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { createId } from "@paralleldrive/cuid2";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { safeAction } from "./safe-action";

export const createCategory = safeAction("createCategory", async (formData: FormData) => {
  const raw = {
    name: formData.get("name"),
    icon: formData.get("icon"),
    color: formData.get("color"),
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const household = await getCurrentHousehold();
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
});

export const updateCategory = safeAction("updateCategory", async (id: string, formData: FormData) => {
  const raw = {
    name: formData.get("name"),
    icon: formData.get("icon"),
    color: formData.get("color"),
  };

  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const updated = await db
    .update(categories)
    .set({
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
    })
    .where(and(eq(categories.id, id), eq(categories.householdId, household.id)))
    .returning({ id: categories.id });
  if (updated.length === 0) return { error: "Category not found" };

  revalidatePath("/categories");
  revalidatePath("/expenses");
  return { success: true };
});

export const deleteCategory = safeAction("deleteCategory", async (id: string) => {
  const household = await getCurrentHousehold();
  if (!household) return { error: "No household found" };

  const [owned] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.householdId, household.id)))
    .limit(1);
  if (!owned) return { error: "Category not found" };

  // Block deletion while the category still has expenses, otherwise those
  // rows would be orphaned (expenses.category_id references categories.id).
  const linkedExpenses = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.categoryId, id))
    .limit(1);
  if (linkedExpenses.length > 0) {
    return { error: "Cannot delete category with existing expenses. Reassign expenses first." };
  }

  await db.delete(categories).where(eq(categories.id, id));
  revalidatePath("/categories");
  return { success: true };
});
