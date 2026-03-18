import { Suspense } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { MemberManager } from "@/components/members/member-manager";
import { getMembersWithStats } from "@/lib/queries/member-queries";
import { getDefaultHousehold } from "@/lib/queries/household-queries";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Members" };

async function MemberContent() {
  const household = await getDefaultHousehold();
  if (!household) return null;

  const members = await getMembersWithStats(household.id);
  return <MemberManager members={members} />;
}

export default function MembersPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Manage your household members"
      />
      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[120px] rounded-xl" />
            ))}
          </div>
        }
      >
        <MemberContent />
      </Suspense>
    </div>
  );
}
