"use client";

import { format, parseISO } from "date-fns";
import { Edit, MoreVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deleteExpense } from "@/lib/actions/expense-actions";
import { CategoryIcon } from "./category-icon";

interface ExpenseItem {
  id: string;
  amount: number;
  description: string;
  date: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  memberName: string;
}

export function ExpenseList({ expenses }: { expenses: ExpenseItem[] }) {
  const formatCurrency = useFormatCurrency();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!deleteId) return;
    setLoading(true);
    try {
      const result = await deleteExpense(deleteId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Expense deleted");
      }
    } finally {
      setDeleteId(null);
      setLoading(false);
    }
  }

  // Group by date
  const grouped = expenses.reduce<Record<string, ExpenseItem[]>>((acc, exp) => {
    (acc[exp.date] ??= []).push(exp);
    return acc;
  }, {});

  return (
    <>
      <div className="space-y-6">
        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-muted-foreground text-sm">
                {format(parseISO(date), "EEEE, MMMM d, yyyy")}
              </h3>
              <span className="font-medium text-sm">
                {formatCurrency(items.reduce((sum, e) => sum + e.amount, 0))}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((expense) => (
                <div
                  key={expense.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
                >
                  <CategoryIcon
                    icon={expense.categoryIcon}
                    color={expense.categoryColor}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-sm">
                      {expense.description}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {expense.categoryName} &middot; {expense.memberName}
                    </p>
                  </div>
                  <span className="whitespace-nowrap font-semibold text-sm">
                    {formatCurrency(expense.amount)}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        />
                      }
                    >
                      <MoreVertical className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        render={<Link href={`/expenses/${expense.id}/edit`} />}
                      >
                        <Edit className="mr-2 h-4 w-4" /> Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteId(expense.id)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete expense"
        description="Are you sure? This action cannot be undone."
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  );
}
