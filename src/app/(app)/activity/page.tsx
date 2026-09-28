import { ActivityActorFilter } from "@/components/activity/activity-actor-filter";
import { ActivityFeed } from "@/components/activity/activity-feed";
import { NoHousehold } from "@/components/shared/no-household";
import { PageHeader } from "@/components/shared/page-header";
import { getActivity, getActivityActors } from "@/lib/queries/activity-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { parseActorFilter } from "@/lib/validators/activity-filter-schema";

export const metadata = { title: "Activity" };
export const dynamic = "force-dynamic";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const actor = parseActorFilter(params.actor);
  const household = await getCurrentHousehold();
  if (!household) {
    return (
      <div className="space-y-6">
        <PageHeader title="Activity" />
        <NoHousehold />
      </div>
    );
  }
  const [rows, actors] = await Promise.all([
    getActivity(household.id, { limit: 50, actor }),
    getActivityActors(household.id),
  ]);
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Activity"
        description="What's happened in this household"
      />
      {/* One actor means nothing to narrow; still show it when a URL filter
          is active so the person can clear it. */}
      {(actors.length > 1 || actor) && (
        <ActivityActorFilter actors={actors} actor={actor} />
      )}
      {/* The feed keeps rows in state; remount it when the filter changes. */}
      <ActivityFeed
        // Prefixed so an actor literally named "everyone" can't collide.
        key={actor === undefined ? "everyone" : `actor:${actor}`}
        actor={actor}
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
