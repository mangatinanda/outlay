"use client";

import { Trash2 } from "lucide-react";
import { motion, type PanInfo, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { shouldRevealDelete } from "./swipe-threshold";

interface ExpenseRowItem {
  id: string;
  amount: number;
  description: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  memberName: string;
}

interface ExpenseRowProps {
  expense: ExpenseRowItem;
  formatCurrency: (value: number) => string;
  onRequestDelete: () => void;
}

export function ExpenseRow({
  expense,
  formatCurrency,
  onRequestDelete,
}: ExpenseRowProps) {
  const reduceMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    setDragging(false);
    if (shouldRevealDelete(info.offset.x)) {
      onRequestDelete();
    }
  }

  return (
    <div
      data-testid="expense-row"
      className="relative overflow-hidden rounded-2xl"
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end bg-destructive/10 pr-5 text-destructive">
        <Trash2 className="size-5" />
      </div>
      <motion.div
        drag={reduceMotion ? false : "x"}
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        whileTap={reduceMotion ? undefined : { scale: 0.99 }}
        className="relative flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card"
      >
        <CategoryIcon
          icon={expense.categoryIcon}
          color={expense.categoryColor}
        />
        <Link
          href={`/expenses/${expense.id}/edit`}
          onClick={(event) => {
            if (dragging) event.preventDefault();
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-sm">
              {expense.description}
            </p>
            <p className="truncate text-muted-foreground text-xs">
              {expense.categoryName} &middot; {expense.memberName}
            </p>
          </div>
          <span className="whitespace-nowrap font-display font-semibold text-sm tabular-nums">
            {formatCurrency(expense.amount)}
          </span>
        </Link>
        <button
          type="button"
          aria-label={`Delete ${expense.description}`}
          onClick={onRequestDelete}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          <Trash2 className="size-4" />
        </button>
      </motion.div>
    </div>
  );
}
