"use client";

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

  return (
    <Card>
      <CardHeader>
        <CardTitle>By Category</CardTitle>
        <CardDescription>Spending breakdown this month</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 lg:flex-row">
          <div className="h-[200px] w-[200px]">
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
                      <div className="rounded-lg border bg-card p-2 shadow-sm">
                        <div className="font-medium text-sm">{d.name}</div>
                        <div className="text-muted-foreground text-xs">
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
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {formatCurrency(item.total)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {total > 0 ? ((item.total / total) * 100).toFixed(0) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
