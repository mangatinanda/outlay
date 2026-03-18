import { ExpenseForm } from "@/components/expenses/expense-form";
import { getCategories } from "@/lib/queries/category-queries";
import { getMembers } from "@/lib/queries/member-queries";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Add Expense" };

export default async function NewExpensePage() {
  const household = await getDefaultHousehold();
  if (!household) return <p>No household found.</p>;

  const [categories, members] = await Promise.all([
    getCategories(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Add Expense" />
      <ExpenseForm categories={categories} members={members} />
    </div>
  );
}
