import { Plus, Receipt, SearchX, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AddExpenseSheet } from "@/components/expenses/add-expense-sheet";
import {
  ExpenseFilters,
  FilterSummary,
} from "@/components/expenses/expense-filters";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExportButton } from "@/components/expenses/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategories } from "@/lib/queries/category-queries";
import { getExpenses } from "@/lib/queries/expense-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getMembers } from "@/lib/queries/member-queries";
import {
  countActiveFilters,
  parseExpenseFilters,
  type RawSearchParams,
} from "@/lib/validators/expense-filter-schema";

export const metadata = { title: "Expenses" };

async function ExpenseContent({ params }: { params: RawSearchParams }) {
  const household = await getCurrentHousehold();
  if (!household)
    return (
      <NoHousehold description="Create a household to start tracking your shared expenses." />
    );

  const filters = parseExpenseFilters(params);
  const activeCount = countActiveFilters(filters);

  const [expenses, categories, members] = await Promise.all([
    getExpenses(household.id, {
      categoryId: filters.category,
      memberId: filters.member,
      startDate: filters.from,
      endDate: filters.to,
      search: filters.q,
    }),
    getCategories(household.id),
    getMembers(household.id),
  ]);

  // "Nothing matches these filters" is a different situation from "this
  // household has no expenses at all" — only the latter offers the first-run
  // call to action, and only the former keeps the filter bar on screen.
  if (expenses.length === 0 && activeCount === 0) {
    return (
      <>
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Start tracking your spending by adding your first expense."
          action={
            <Button nativeButton={false} render={<Link href="/expenses/new" />}>
              <Plus className="mr-2 h-4 w-4" /> Add Expense
            </Button>
          }
        />
        <AddExpenseSheet categories={categories} members={members} />
      </>
    );
  }

  const filterBar = (
    <ExpenseFilters
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      members={members.map((m) => ({ id: m.id, name: m.name }))}
    />
  );

  if (expenses.length === 0) {
    return (
      <>
        {filterBar}
        <EmptyState
          icon={SearchX}
          title="No matching expenses"
          description="No expenses match these filters. Try widening the date range or clearing a filter."
        />
        <AddExpenseSheet categories={categories} members={members} />
      </>
    );
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <>
      {filterBar}
      <div className="-mt-2 flex items-center justify-between gap-3">
        {activeCount > 0 ? (
          <FilterSummary count={expenses.length} total={total} />
        ) : (
          <span />
        )}
        <ExportButton
          records={expenses.map((e) => ({
            date: e.date,
            description: e.description,
            categoryName: e.categoryName,
            memberName: e.memberName,
            amount: e.amount,
            notes: e.notes,
          }))}
          householdName={household.name}
        />
      </div>
      <ExpenseList expenses={expenses} />
      <AddExpenseSheet categories={categories} members={members} />
    </>
  );
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  // No household yet → hide Import/Add actions; the body shows a create CTA.
  const household = await getCurrentHousehold();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description={household ? "All your household expenses" : undefined}
        action={
          household ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/expenses/import" />}
              >
                <Upload className="mr-2 h-4 w-4" /> Import
              </Button>
              <Button
                nativeButton={false}
                render={<Link href="/expenses/new" />}
              >
                <Plus className="mr-2 h-4 w-4" /> Add Expense
              </Button>
            </div>
          ) : undefined
        }
      />
      <Suspense
        // Re-suspend (and re-run the query) whenever the filters change.
        key={new URLSearchParams(
          Object.entries(params).flatMap(([k, v]) =>
            v === undefined
              ? []
              : [[k, Array.isArray(v) ? v[0] : v] as [string, string]],
          ),
        ).toString()}
        fallback={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        }
      >
        <ExpenseContent params={params} />
      </Suspense>
    </div>
  );
}
