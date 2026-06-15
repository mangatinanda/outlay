"use client";

import { PieChart as PieChartIcon } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CategoryPieChartProps {
  data: { name: string; color: string; total: number; count: number }[];
}

export function CategoryPieChart({ data }: CategoryPieChartProps) {
  const formatCurrency = useFormatCurrency();
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const isEmpty = total === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>By Category</CardTitle>
        <CardDescription>Spending breakdown this month</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
              <PieChartIcon className="h-6 w-6" aria-hidden />
            </div>
            <p className="font-medium text-sm">No categories yet</p>
            <p className="text-muted-foreground text-xs">
              Add expenses to see how your spending breaks down.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 lg:flex-row">
            <div className="h-[200px] w-[200px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {data.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border bg-card p-2 shadow-card">
                          <div className="font-medium text-sm">{d.name}</div>
                          <div className="text-muted-foreground text-xs tabular-nums">
                            {formatCurrency(d.total)} ({d.count} expenses)
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full flex-1 space-y-2">
              {data.slice(0, 6).map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate">{item.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-medium tabular-nums">
                      {formatCurrency(item.total)}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground text-xs tabular-nums">
                      {((item.total / total) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
