import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity } from "@/lib/db/schema";

/** Newest-first activity for a household. `before` is a unix-ms cursor for
 *  "show more" (pass the createdAt of the last row you have). */
export async function getActivity(
  householdId: string,
  opts: { before?: number; limit?: number } = {},
) {
  const limit = opts.limit ?? 50;
  return db
    .select({
      id: activity.id,
      actorLabel: activity.actorLabel,
      action: activity.action,
      summary: activity.summary,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .where(
      opts.before
        ? and(
            eq(activity.householdId, householdId),
            lt(activity.createdAt, new Date(opts.before)),
          )
        : eq(activity.householdId, householdId),
    )
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}
