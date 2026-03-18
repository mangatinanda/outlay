import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expenses/expense-form";
import { getExpenseById } from "@/lib/queries/expense-queries";
import { getCategories } from "@/lib/queries/category-queries";
import { getMembers } from "@/lib/queries/member-queries";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = { title: "Edit Expense" };

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const expense = await getExpenseById(id);
  if (!expense) notFound();

  const household = await getDefaultHousehold();
  if (!household) return <p>No household found.</p>;

  const [categories, members] = await Promise.all([
    getCategories(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Edit Expense" />
      <ExpenseForm categories={categories} members={members} expense={expense} />
    </div>
  );
}
