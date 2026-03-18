import { db } from "@/lib/db";
import { expenses, categories, householdMembers } from "@/lib/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";

export async function getDashboardStats(householdId: string) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

  const [currentMonth] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
      count: sql<number>`count(${expenses.id})`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, monthStart),
        lte(expenses.date, monthEnd)
      )
    );

  const [prevMonth] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, prevMonthStart),
        lte(expenses.date, prevMonthEnd)
      )
    );

  const daysInMonth = now.getDate();
  const dailyAvg = daysInMonth > 0 ? currentMonth.total / daysInMonth : 0;

  return {
    monthTotal: currentMonth.total,
    monthCount: currentMonth.count,
    prevMonthTotal: prevMonth.total,
    dailyAverage: dailyAvg,
    monthChange: prevMonth.total > 0
      ? ((currentMonth.total - prevMonth.total) / prevMonth.total) * 100
      : 0,
  };
}

export async function getCategoryBreakdown(householdId: string) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  return db
    .select({
      name: categories.name,
      color: categories.color,
      icon: categories.icon,
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.as("total"),
      count: sql<number>`count(${expenses.id})`.as("count"),
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, monthStart),
        lte(expenses.date, monthEnd)
      )
    )
    .groupBy(categories.id)
    .orderBy(desc(sql`total`));
}

export async function getSpendingByDay(householdId: string, days: number = 30) {
  const startDate = format(subDays(new Date(), days), "yyyy-MM-dd");

  return db
    .select({
      date: expenses.date,
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.as("total"),
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, startDate)
      )
    )
    .groupBy(expenses.date)
    .orderBy(expenses.date);
}

export async function getMemberSpending(householdId: string) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");

  return db
    .select({
      name: householdMembers.name,
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.as("total"),
      count: sql<number>`count(${expenses.id})`.as("count"),
    })
    .from(expenses)
    .innerJoin(householdMembers, eq(expenses.memberId, householdMembers.id))
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, monthStart),
        lte(expenses.date, monthEnd)
      )
    )
    .groupBy(householdMembers.id)
    .orderBy(desc(sql`total`));
}

export async function getRecentExpenses(householdId: string, limit: number = 5) {
  return db
    .select({
      id: expenses.id,
      amount: expenses.amount,
      description: expenses.description,
      date: expenses.date,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
      memberName: householdMembers.name,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(householdMembers, eq(expenses.memberId, householdMembers.id))
    .where(eq(expenses.householdId, householdId))
    .orderBy(desc(expenses.date), desc(expenses.createdAt))
    .limit(limit);
}
