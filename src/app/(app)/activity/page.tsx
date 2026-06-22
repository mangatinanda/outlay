import { ActivityFeed } from "@/components/activity/activity-feed";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { getActivity } from "@/lib/queries/activity-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const household = await getCurrentHousehold();
  if (!household) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activity" />
        <NoHousehold />
      </div>
    );
  }
  const rows = await getActivity(household.id, { limit: 50 });
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Activity"
        description="What's happened in this household"
      />
      <ActivityFeed
        initial={rows.map((r) => ({
          id: r.id,
          actorLabel: r.actorLabel,
          summary: r.summary,
          createdAt: r.createdAt.getTime(),
        }))}
      />
    </div>
  );
}
