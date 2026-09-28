import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { activity } from "@/lib/db/schema";

/** Newest-first activity for a household. `before` is a unix-ms cursor for
 *  "show more" (pass the createdAt of the last row you have); `actor` narrows
 *  the feed to one actor_label (the "who did it" filter). */
export async function getActivity(
  householdId: string,
  opts: { before?: number; limit?: number; actor?: string } = {},
) {
  const limit = opts.limit ?? 50;
  const conditions = [eq(activity.householdId, householdId)];
  if (opts.before) {
    conditions.push(lt(activity.createdAt, new Date(opts.before)));
  }
  if (opts.actor) conditions.push(eq(activity.actorLabel, opts.actor));
  return db
    .select({
      id: activity.id,
      actorLabel: activity.actorLabel,
      action: activity.action,
      summary: activity.summary,
      createdAt: activity.createdAt,
    })
    .from(activity)
    .where(and(...conditions))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
}

/** Distinct actor labels that appear in this household's feed, A→Z
 *  case-insensitively (SQLite's default BINARY collation would sort every
 *  lowercase-initial name after the capitalised ones). Read from the feed
 *  itself (not the member list) so past actors who have since left, and the
 *  passcode "Admin", stay filterable. */
export async function getActivityActors(
  householdId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ actorLabel: activity.actorLabel })
    .from(activity)
    .where(eq(activity.householdId, householdId))
    .orderBy(sql`lower(${activity.actorLabel})`);
  return rows.map((r) => r.actorLabel);
}
