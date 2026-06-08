import { Suspense } from "react";
import { ExpenseList } from "@/components/expenses/expense-list";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getExpenses } from "@/lib/queries/expense-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Receipt } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Expenses" };

async function ExpenseContent() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const expenses = await getExpenses(household.id);

  if (expenses.length === 0) {
    return (
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
    );
  }

  return <ExpenseList expenses={expenses} />;
}

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="All your household expenses"
        action={
          <Button nativeButton={false} render={<Link href="/expenses/new" />}>
            <Plus className="mr-2 h-4 w-4" /> Add Expense
          </Button>
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
