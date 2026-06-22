"use client";

import { format, isToday, isYesterday } from "date-fns";
import { Activity as ActivityIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { loadMoreActivity } from "@/lib/actions/activity-actions";

interface Row {
  id: string;
  actorLabel: string;
  summary: string;
  createdAt: number;
}

function dayLabel(ms: number) {
  const d = new Date(ms);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

export function ActivityFeed({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(initial.length < 50);

  async function showMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const res = await loadMoreActivity(last.createdAt);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setRows((r) => [...r, ...res.rows]);
      if (res.rows.length < 50) setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        title="No activity yet"
        description="Expenses, settlements, and member changes will show up here."
      />
    );
  }

  let lastDay = "";
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 pt-6">
          {rows.map((r) => {
            const label = dayLabel(r.createdAt);
            const showHeader = label !== lastDay;
            lastDay = label;
            return (
              <div key={r.id}>
                {showHeader && (
                  <p className="pt-3 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                    {label}
                  </p>
                )}
                <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
                  <span>
                    <span className="font-medium">{r.actorLabel}</span>{" "}
                    {r.summary}
                  </span>
                  <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                    {format(new Date(r.createdAt), "h:mm a")}
                  </span>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
      {!done && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={showMore} disabled={loading}>
            {loading ? "Loading…" : "Show more"}
          </Button>
        </div>
      )}
    </div>
  );
}
