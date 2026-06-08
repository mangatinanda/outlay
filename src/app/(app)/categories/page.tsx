import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryManager } from "@/components/categories/category-manager";
import { getCategoriesWithCount } from "@/lib/queries/category-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Categories" };

async function CategoryContent() {
  const household = await getCurrentHousehold();
  if (!household) return null;

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
