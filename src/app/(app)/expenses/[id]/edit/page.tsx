import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { PageHeader } from "@/components/shared/page-header";
import { getCategories } from "@/lib/queries/category-queries";
import { getExpenseById } from "@/lib/queries/expense-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getMembers } from "@/lib/queries/member-queries";

export const metadata = { title: "Edit Expense" };

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const household = await getCurrentHousehold();
  if (!household) return <p>No household found.</p>;

  // Scoped to the active household: a foreign expense id 404s instead of
  // rendering against this household's categories/members.
  const expense = await getExpenseById(id, household.id);
  if (!expense) notFound();

  const [categories, members] = await Promise.all([
    getCategories(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Edit Expense" />
      <ExpenseForm
        categories={categories}
        members={members}
        expense={expense}
      />
    </div>
  );
}
