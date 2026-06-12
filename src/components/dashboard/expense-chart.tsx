"use client";

import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { format, parseISO } from "date-fns";

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
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                className="text-xs fill-muted-foreground"
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
                      <div className="text-sm font-medium">
                        {formatCurrency(Number(payload[0].value))}
                      </div>
                      <div className="text-xs text-muted-foreground">
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
