"use server";

import { getActivity } from "@/lib/queries/activity-queries";
import { getCurrentHousehold } from "@/lib/queries/household-queries";
import { safeAction } from "./safe-action";

export const loadMoreActivity = safeAction(
  "loadMoreActivity",
  async (beforeMs: number) => {
    const household = await getCurrentHousehold();
    if (!household) return { error: "No household found" };
    const rows = await getActivity(household.id, {
      before: beforeMs,
      limit: 50,
    });
    return {
      success: true as const,
      rows: rows.map((r) => ({
        id: r.id,
        actorLabel: r.actorLabel,
        summary: r.summary,
        createdAt: r.createdAt.getTime(),
      })),
    };
  },
);
