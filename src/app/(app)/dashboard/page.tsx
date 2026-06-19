import { Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CategoryPieChart } from "@/components/dashboard/category-pie-chart";
import { ExpenseChart } from "@/components/dashboard/expense-chart";
import { MemberBarChart } from "@/components/dashboard/member-bar-chart";
import { RecentExpenses } from "@/components/dashboard/recent-expenses";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCategoryBreakdown,
  getDashboardStats,
  getMemberSpending,
  getRecentExpenses,
  getSpendingByDay,
} from "@/lib/queries/dashboard-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";

export const metadata = { title: "Dashboard" };

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px] rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[380px] rounded-xl" />
        <Skeleton className="h-[380px] rounded-xl" />
      </div>
    </div>
  );
}

async function DashboardContent() {
  const household = await getCurrentHousehold();
  if (!household)
    return <p>No household found. Please set up your home first.</p>;

  const [stats, categoryData, dailyData, memberData, recent] =
    await Promise.all([
      getDashboardStats(household.id),
      getCategoryBreakdown(household.id),
      getSpendingByDay(household.id, 30),
      getMemberSpending(household.id),
      getRecentExpenses(household.id, 5),
    ]);

  return (
    <div className="space-y-6">
      <SummaryCards stats={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ExpenseChart data={dailyData} />
        <CategoryPieChart data={categoryData} />
      </div>
      <MemberBarChart data={memberData} />
      <RecentExpenses expenses={recent} />
      <InstallPrompt />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your household spending"
        action={
          <Button nativeButton={false} render={<Link href="/expenses/new" />}>
            <Plus className="mr-2 h-4 w-4" /> Add Expense
          </Button>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
