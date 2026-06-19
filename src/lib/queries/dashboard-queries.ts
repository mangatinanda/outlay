import {
  addDays,
  endOfMonth,
  format,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, expenses, householdMembers } from "@/lib/db/schema";

export async function getDashboardStats(householdId: string) {
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const prevMonthStart = format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd");
  const prevMonthEnd = format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd");

  const [currentMonth] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.amountMinor}), 0) / 100.0`,
      count: sql<number>`count(${expenses.id})`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, monthStart),
        lte(expenses.date, monthEnd),
      ),
    );

  const [prevMonth] = await db
    .select({
      total: sql<number>`coalesce(sum(${expenses.amountMinor}), 0) / 100.0`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, prevMonthStart),
        lte(expenses.date, prevMonthEnd),
      ),
    );

  const daysInMonth = now.getDate();
  const dailyAvg = daysInMonth > 0 ? currentMonth.total / daysInMonth : 0;

  return {
    monthTotal: currentMonth.total,
    monthCount: currentMonth.count,
    prevMonthTotal: prevMonth.total,
    dailyAverage: dailyAvg,
    monthChange:
      prevMonth.total > 0
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
      total: sql<number>`coalesce(sum(${expenses.amountMinor}), 0) / 100.0`.as(
        "total",
      ),
      count: sql<number>`count(${expenses.id})`.as("count"),
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.householdId, householdId),
        gte(expenses.date, monthStart),
        lte(expenses.date, monthEnd),
      ),
    )
    .groupBy(categories.id)
    .orderBy(desc(sql`total`));
}

export async function getSpendingByDay(householdId: string, days: number = 30) {
  const start = subDays(new Date(), days);
  const startDate = format(start, "yyyy-MM-dd");

  const rows = await db
    .select({
      date: expenses.date,
      total: sql<number>`coalesce(sum(${expenses.amountMinor}), 0) / 100.0`.as(
        "total",
      ),
    })
    .from(expenses)
    .where(
      and(eq(expenses.householdId, householdId), gte(expenses.date, startDate)),
    )
    .groupBy(expenses.date)
    .orderBy(expenses.date);

  // Zero-fill: the chart should show a continuous window, not skip quiet days.
  const totals = new Map(rows.map((r) => [r.date, r.total]));
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = format(addDays(start, i), "yyyy-MM-dd");
    return { date, total: totals.get(date) ?? 0 };
  });
}

/** All-time spending per member for a household, highest first. Powers the
 *  dashboard "By Member" bar chart. */
export async function getMemberSpending(householdId: string) {
  return db
    .select({
      name: householdMembers.name,
      total: sql<number>`coalesce(sum(${expenses.amountMinor}), 0) / 100.0`.as(
        "total",
      ),
      count: sql<number>`count(${expenses.id})`.as("count"),
    })
    .from(expenses)
    .innerJoin(householdMembers, eq(expenses.memberId, householdMembers.id))
    .where(eq(expenses.householdId, householdId))
    .groupBy(householdMembers.id)
    .orderBy(desc(sql`total`));
}

export async function getRecentExpenses(
  householdId: string,
  limit: number = 5,
) {
  return db
    .select({
      id: expenses.id,
      amount: sql<number>`${expenses.amountMinor} / 100.0`,
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
