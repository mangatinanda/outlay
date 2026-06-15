"use client";

import {
  CalendarDays,
  Minus,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { AnimatedNumber, Stagger, StaggerItem } from "@/components/motion";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Card, CardContent } from "@/components/ui/card";
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
  const hasBaseline = stats.prevMonthTotal > 0;
  const up = stats.monthChange > 0;
  const PillIcon = !hasBaseline ? Minus : up ? TrendingUp : TrendingDown;

  const chips = [
    {
      title: "Daily Average",
      value: formatCurrency(stats.dailyAverage),
      caption: "Average per day this month",
      icon: CalendarDays,
      tile: "bg-chart-2/15 text-chart-2",
    },
    {
      title: "Transactions",
      value: stats.monthCount.toString(),
      caption: "Expenses this month",
      icon: Receipt,
      tile: "bg-chart-1/20 text-chart-1",
    },
    {
      title: "Last Month",
      value: formatCurrency(stats.prevMonthTotal),
      caption: "Total spending",
      icon: stats.monthChange <= 0 ? TrendingDown : TrendingUp,
      tile: "bg-chart-4/15 text-chart-4",
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="relative overflow-hidden bg-gradient-to-br from-chart-4 to-chart-3 text-white shadow-card ring-0 lg:col-span-1">
        <CardContent className="flex h-full flex-col justify-between gap-6 p-5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-white/80">
              This Month
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 font-medium text-xs">
              <PillIcon className="h-3.5 w-3.5" aria-hidden />
              {hasBaseline
                ? `${up ? "+" : ""}${stats.monthChange.toFixed(1)}% MoM`
                : "No baseline"}
            </span>
          </div>
          <span data-slot="hero-total">
            <AnimatedNumber
              value={stats.monthTotal}
              format={(v) => formatCurrency(v)}
              className="font-bold text-4xl tabular-nums tracking-tight"
            />
          </span>
          <span className="text-white/70 text-xs">
            {hasBaseline
              ? "Compared with last month"
              : "No spending recorded last month"}
          </span>
        </CardContent>
      </Card>

      <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2">
        {chips.map((chip) => (
          <StaggerItem key={chip.title}>
            <Card className="h-full shadow-card">
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg",
                    chip.tile,
                  )}
                >
                  <chip.icon className="h-4 w-4" aria-hidden />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground text-sm">
                    {chip.title}
                  </p>
                  <p className="font-bold text-2xl tabular-nums">
                    {chip.value}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {chip.caption}
                  </p>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
