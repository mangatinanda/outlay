import { db } from "@/lib/db";
import { expenses, categories, householdMembers } from "@/lib/db/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export async function getExpenses(householdId: string, filters?: {
  categoryId?: string;
  memberId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}) {
  const conditions = [eq(expenses.householdId, householdId)];

  if (filters?.categoryId) {
    conditions.push(eq(expenses.categoryId, filters.categoryId));
  }
  if (filters?.memberId) {
    conditions.push(eq(expenses.memberId, filters.memberId));
  }
  if (filters?.startDate) {
    conditions.push(gte(expenses.date, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(expenses.date, filters.endDate));
  }

  const result = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      description: expenses.description,
      date: expenses.date,
      notes: expenses.notes,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      memberId: expenses.memberId,
      memberName: householdMembers.name,
      createdAt: expenses.createdAt,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(householdMembers, eq(expenses.memberId, householdMembers.id))
    .where(and(...conditions))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(filters?.limit ?? 100);

  return result;
}

export async function getExpenseById(id: string) {
  const result = await db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      description: expenses.description,
      date: expenses.date,
      notes: expenses.notes,
      categoryId: expenses.categoryId,
      categoryName: categories.name,
      memberId: expenses.memberId,
      memberName: householdMembers.name,
      householdId: expenses.householdId,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(householdMembers, eq(expenses.memberId, householdMembers.id))
    .where(eq(expenses.id, id))
    .limit(1);

  return result[0] ?? null;
}
