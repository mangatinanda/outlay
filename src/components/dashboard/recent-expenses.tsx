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
        <div className="space-y-3">
          {expenses.map((expense) => (
            <div
              key={expense.id}
              className="flex items-center justify-between py-2"
            >
              <div className="flex items-center gap-3">
                <CategoryIcon
                  icon={expense.categoryIcon}
                  color={expense.categoryColor}
                />
                <div>
                  <p className="font-medium text-sm leading-none">
                    {expense.description}
                  </p>
                  <p className="mt-1 text-muted-foreground text-xs">
                    {expense.categoryName} &middot; {expense.memberName}{" "}
                    &middot; {format(parseISO(expense.date), "MMM d")}
                  </p>
                </div>
              </div>
              <span className="font-semibold text-sm">
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
