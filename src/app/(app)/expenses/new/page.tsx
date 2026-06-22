import { ExpenseForm } from "@/components/expenses/expense-form";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { getCategories } from "@/lib/queries/category-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getMembers } from "@/lib/queries/member-queries";

export const metadata = { title: "Add Expense" };

export default async function NewExpensePage() {
  const household = await getCurrentHousehold();
  if (!household)
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader title="Add Expense" />
        <NoHousehold description="Create a household before adding expenses." />
      </div>
    );

  const [categories, members] = await Promise.all([
    getCategories(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Add Expense" />
      <ExpenseForm categories={categories} members={members} />
    </div>
  );
}
