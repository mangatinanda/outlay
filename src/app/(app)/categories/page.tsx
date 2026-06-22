import { Suspense } from "react";
import { CategoryManager } from "@/components/categories/category-manager";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getCategoriesWithCount } from "@/lib/queries/category-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";

export const metadata = { title: "Categories" };

async function CategoryContent() {
  const household = await getCurrentHousehold();
  if (!household)
    return (
      <NoHousehold description="Create a household to organize your spending into categories." />
    );

  const categories = await getCategoriesWithCount(household.id);
  return <CategoryManager categories={categories} />;
}

export default function CategoriesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Manage your expense categories"
      />
      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[100px] rounded-xl" />
            ))}
          </div>
        }
      >
        <CategoryContent />
      </Suspense>
    </div>
  );
}
