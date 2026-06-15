"use client";

import { format, parseISO } from "date-fns";
import {
  Bar,
  BarChart,
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
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                className="fill-muted-foreground text-xs"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
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
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="rounded-lg border bg-card p-2 shadow-sm">
                      <div className="font-medium text-sm">
                        {formatCurrency(Number(payload[0].value))}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {payload[0].payload.label}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="total"
                fill="oklch(0.546 0.245 262.881)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
