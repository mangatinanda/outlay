import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/components/shared/currency-display";
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { CategoryIcon } from "@/components/expenses/category-icon";

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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Recent Expenses</CardTitle>
          <CardDescription>Your latest transactions</CardDescription>
        </div>
        <Button variant="ghost" size="sm" render={<Link href="/expenses" />}>
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
                <CategoryIcon icon={expense.categoryIcon} color={expense.categoryColor} />
                <div>
                  <p className="text-sm font-medium leading-none">
                    {expense.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {expense.categoryName} &middot; {expense.memberName} &middot;{" "}
                    {format(parseISO(expense.date), "MMM d")}
                  </p>
                </div>
              </div>
              <span className="text-sm font-semibold">
                {formatCurrency(expense.amount)}
              </span>
            </div>
          ))}
          {expenses.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No expenses yet. Add your first expense!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
