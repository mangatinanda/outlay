"use client";

import {
  CalendarDays,
  DollarSign,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SummaryCardsProps {
  stats: {
    monthTotal: number;
    monthCount: number;
    prevMonthTotal: number;
    dailyAverage: number;
    monthChange: number;
  };
}

export function SummaryCards({ stats }: SummaryCardsProps) {
  const formatCurrency = useFormatCurrency();
  const cards = [
    {
      title: "This Month",
      value: formatCurrency(stats.monthTotal),
      icon: DollarSign,
      // A 0% change against an empty month is "no baseline", not "flat".
      description:
        stats.prevMonthTotal > 0
          ? `${stats.monthChange > 0 ? "+" : ""}${stats.monthChange.toFixed(1)}% from last month`
          : "No spending recorded last month",
      trend: stats.prevMonthTotal > 0 ? stats.monthChange : null,
    },
    {
      title: "Daily Average",
      value: formatCurrency(stats.dailyAverage),
      icon: CalendarDays,
      description: "Average per day this month",
      trend: null,
    },
    {
      title: "Transactions",
      value: stats.monthCount.toString(),
      icon: Receipt,
      description: "Expenses this month",
      trend: null,
    },
    {
      title: "Last Month",
      value: formatCurrency(stats.prevMonthTotal),
      icon: stats.monthChange <= 0 ? TrendingDown : TrendingUp,
      description: "Total spending",
      trend: null,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium text-muted-foreground text-sm">
              {card.title}
            </CardTitle>
            <card.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-bold text-2xl">{card.value}</div>
            {card.description && (
              <p
                className={cn(
                  "mt-1 text-xs",
                  card.trend !== null && card.trend > 0 && "text-destructive",
                  card.trend !== null &&
                    card.trend <= 0 &&
                    "text-green-600 dark:text-green-400",
                  card.trend === null && "text-muted-foreground",
                )}
              >
                {card.description}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
