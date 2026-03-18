import { db } from "@/lib/db";
import { categories, expenses } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export async function getCategories(householdId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(categories.name);
}

export async function getCategoriesWithCount(householdId: string) {
  return db
    .select({
      id: categories.id,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      isDefault: categories.isDefault,
      expenseCount: sql<number>`count(${expenses.id})`.as("expense_count"),
    })
    .from(categories)
    .leftJoin(expenses, eq(categories.id, expenses.categoryId))
    .where(eq(categories.householdId, householdId))
    .groupBy(categories.id)
    .orderBy(categories.name);
}
