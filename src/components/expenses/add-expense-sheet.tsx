"use client";

import { Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { ExpenseForm } from "@/components/expenses/expense-form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Category, HouseholdMember } from "@/lib/db/schema";

interface AddExpenseSheetProps {
  categories: Category[];
  members: HouseholdMember[];
}

export function AddExpenseSheet({ categories, members }: AddExpenseSheetProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <>
      <motion.button
        type="button"
        aria-label="Add expense"
        onClick={() => setOpen(true)}
        layoutId={reduceMotion ? undefined : "add-fab"}
        whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-float md:hidden"
      >
        <Plus className="size-6" />
      </motion.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader>
            <SheetTitle className="font-display">New Expense</SheetTitle>
            <SheetDescription className="sr-only">
              Add a new household expense.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <ExpenseForm
              categories={categories}
              members={members}
              variant="sheet"
              onDone={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
