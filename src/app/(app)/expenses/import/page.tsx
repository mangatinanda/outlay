import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { ImportExpenses } from "@/components/expenses/import-expenses";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { visiblePayers } from "@/lib/members";
import { getCategories } from "@/lib/queries/category-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { getMembers } from "@/lib/queries/member-queries";

export const metadata = { title: "Import Expenses" };

// Reads the active household per request, so render dynamically.
export const dynamic = "force-dynamic";

export default async function ImportExpensesPage() {
  const household = await getCurrentHousehold();
  if (!household)
    return (
      <div className="max-w-3xl space-y-6">
        <PageHeader title="Import expenses" />
        <NoHousehold description="Create a household before importing expenses." />
      </div>
    );

  const [categories, members] = await Promise.all([
    getCategories(household.id),
    getMembers(household.id),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title="Import expenses"
        description={`Upload a CSV to add expenses to ${household.name}.`}
        action={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/expenses" />}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        }
      />
      <ImportExpenses
        existingCategories={categories.map((c) => c.name)}
        members={visiblePayers(members).map((m) => ({
          id: m.id,
          name: m.name,
          email: m.email,
        }))}
      />
    </div>
  );
}
