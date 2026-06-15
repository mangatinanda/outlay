"use client";

import { format, parseISO } from "date-fns";
import { LineChart as LineChartIcon } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
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

interface ExpenseChartProps {
  data: { date: string; total: number }[];
}

export function ExpenseChart({ data }: ExpenseChartProps) {
  const formatCurrency = useFormatCurrency();
  const isEmpty = data.every((d) => d.total === 0);
  const chartData = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Spending</CardTitle>
        <CardDescription>Your spending over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
              <LineChartIcon className="h-6 w-6" aria-hidden />
            </div>
            <p className="font-medium text-sm">No spending yet this month</p>
            <p className="text-muted-foreground text-xs">
              Your daily spending will appear here once you add expenses.
            </p>
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="dailySpendFill"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--chart-3)"
                      stopOpacity={0.35}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--chart-3)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                  vertical={false}
                />
                <XAxis
                  dataKey="label"
                  className="fill-muted-foreground text-xs"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  className="fill-muted-foreground text-xs"
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(v) =>
                    formatCurrency(Number(v), {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 0,
                    })
                  }
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="rounded-lg border bg-card p-2 shadow-card">
                        <div className="font-medium text-sm tabular-nums">
                          {formatCurrency(Number(payload[0].value))}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {payload[0].payload.label}
                        </div>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  fill="url(#dailySpendFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
