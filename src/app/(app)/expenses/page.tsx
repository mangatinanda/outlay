import { Plus, Receipt, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AddExpenseSheet } from "@/components/expenses/add-expense-sheet";
import { ExpenseList } from "@/components/expenses/expense-list";
import { ExportButton } from "@/components/expenses/export-button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategories } from "@/lib/queries/category-queries";
import { getExpenses } from "@/lib/queries/expense-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getMembers } from "@/lib/queries/member-queries";

export const metadata = { title: "Expenses" };

async function ExpenseContent() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const [expenses, categories, members] = await Promise.all([
    getExpenses(household.id),
    getCategories(household.id),
    getMembers(household.id),
  ]);

  if (expenses.length === 0) {
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

  return (
    <>
      <div className="-mt-2 flex justify-end">
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

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="All your household expenses"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/expenses/import" />}
            >
              <Upload className="mr-2 h-4 w-4" /> Import
            </Button>
            <Button nativeButton={false} render={<Link href="/expenses/new" />}>
              <Plus className="mr-2 h-4 w-4" /> Add Expense
            </Button>
          </div>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] rounded-lg" />
            ))}
          </div>
        }
      >
        <ExpenseContent />
      </Suspense>
    </div>
  );
}
