import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { expenses, householdMembers } from "@/lib/db/schema";

export async function getMembers(householdId: string) {
  return db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId))
    .orderBy(householdMembers.name);
}

export async function getMembersWithStats(householdId: string) {
  return db
    .select({
      id: householdMembers.id,
      name: householdMembers.name,
      role: householdMembers.role,
      avatar: householdMembers.avatar,
      email: householdMembers.email,
      userId: householdMembers.userId,
      includeInSettleUp: householdMembers.includeInSettleUp,
      expenseCount: sql<number>`count(${expenses.id})`.as("expense_count"),
      totalSpent:
        sql<number>`coalesce(sum(${expenses.amountMinor}), 0) / 100.0`.as(
          "total_spent",
        ),
    })
    .from(householdMembers)
    .leftJoin(expenses, eq(householdMembers.id, expenses.memberId))
    .where(eq(householdMembers.householdId, householdId))
    .groupBy(householdMembers.id)
    .orderBy(householdMembers.name);
}
