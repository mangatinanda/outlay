"use client";

import { Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface MemberBarChartProps {
  data: { name: string; total: number; count: number }[];
}

const BAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function MemberBarChart({ data }: MemberBarChartProps) {
  const formatCurrency = useFormatCurrency();
  const isEmpty = data.length === 0 || data.every((d) => d.total === 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>By Member</CardTitle>
        <CardDescription>All-time spending by member</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
              <Users className="h-6 w-6" aria-hidden />
            </div>
            <p className="font-medium text-sm">No spending yet</p>
            <p className="text-muted-foreground text-xs">
              Each member's spending will appear here once expenses are added.
            </p>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  horizontal={false}
                />
                <XAxis
                  type="number"
                  className="fill-muted-foreground text-xs"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    formatCurrency(Number(v), {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  }
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  className="fill-muted-foreground text-xs"
                  tickLine={false}
                  axisLine={false}
                  width={88}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
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
                <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                  {data.map((d, i) => (
                    <Cell
                      key={d.name}
                      fill={BAR_COLORS[i % BAR_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
