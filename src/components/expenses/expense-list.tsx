"use client";

import { format, parseISO } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteExpense } from "@/lib/actions/expense-actions";
import { ExpenseRow } from "./expense-row";

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
      <div className="space-y-8">
        {Object.entries(grouped).map(([date, items]) => (
          <section key={date}>
            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between bg-background/80 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <h3 className="font-display font-semibold text-muted-foreground text-sm">
                {format(parseISO(date), "EEEE, MMMM d, yyyy")}
              </h3>
              <span className="font-display font-semibold text-sm tabular-nums">
                {formatCurrency(items.reduce((sum, e) => sum + e.amount, 0))}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  formatCurrency={formatCurrency}
                  onRequestDelete={() => setDeleteId(expense.id)}
                />
              ))}
            </div>
          </section>
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
