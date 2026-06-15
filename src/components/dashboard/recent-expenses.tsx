"use client";

import { format, parseISO } from "date-fns";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface RecentExpensesProps {
  expenses: {
    id: string;
    amount: number;
    description: string;
    date: string;
    categoryName: string;
    categoryIcon: string;
    categoryColor: string;
    memberName: string;
  }[];
}

export function RecentExpenses({ expenses }: RecentExpensesProps) {
  const formatCurrency = useFormatCurrency();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Expenses</CardTitle>
          <CardDescription>Your latest transactions</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/expenses" />}
        >
          View all <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-3">
                <CategoryIcon
                  icon={expense.categoryIcon}
                  color={expense.categoryColor}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-sm leading-none">
                    {expense.description}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5 text-muted-foreground text-xs">
                    <span className="flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: expense.categoryColor }}
                      />
                      {expense.categoryName}
                    </span>
                    <span>{expense.memberName}</span>
                    <span aria-hidden>&middot;</span>
                    <span>{format(parseISO(expense.date), "MMM d")}</span>
                  </div>
                </div>
              </div>
              <span className="shrink-0 font-semibold text-sm tabular-nums">
                {formatCurrency(expense.amount)}
              </span>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="py-4 text-center text-muted-foreground text-sm">
              No expenses yet. Add your first expense!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
