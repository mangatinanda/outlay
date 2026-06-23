"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/expenses/category-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createExpense, updateExpense } from "@/lib/actions/expense-actions";
import type { Category, HouseholdMember } from "@/lib/db/schema";
import { withProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";

interface ExpenseFormProps {
  categories: Category[];
  members: HouseholdMember[];
  expense?: {
    id: string;
    amount: number;
    description: string;
    date: string;
    categoryId: string;
    memberId: string;
    notes: string | null;
  };
  variant?: "page" | "sheet";
  onDone?: () => void;
}

export function ExpenseForm({
  categories,
  members,
  expense,
  variant = "page",
  onDone,
}: ExpenseFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const isEditing = !!expense;
  const [categoryId, setCategoryId] = useState(
    expense?.categoryId ?? categories[0]?.id ?? "",
  );
  const [memberId, setMemberId] = useState(
    expense?.memberId ?? members[0]?.id ?? "",
  );

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      const result = await withProgress(() =>
        isEditing
          ? updateExpense(expense.id, formData)
          : createExpense(formData),
      );

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(isEditing ? "Expense updated" : "Expense added");
      if (variant === "sheet") {
        onDone?.();
        router.refresh();
      } else {
        router.push("/expenses");
      }
    } finally {
      setLoading(false);
    }
  }

  const formBody = (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={expense?.amount}
            required
            className="h-14 font-display font-semibold text-3xl tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={
              expense?.date || new Date().toLocaleDateString("en-CA")
            }
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          placeholder="What did you spend on?"
          defaultValue={expense?.description}
          required
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <input type="hidden" name="categoryId" value={categoryId} />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {categories.map((cat) => {
              const active = cat.id === categoryId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                  <span className="whitespace-nowrap">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Paid by</Label>
          <input type="hidden" name="memberId" value={memberId} />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {members.map((member) => {
              const active = member.id === memberId;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setMemberId(member.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Avatar size="sm">
                    <AvatarFallback>
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="whitespace-nowrap pr-1">{member.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Any additional details..."
          defaultValue={expense?.notes || ""}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : isEditing ? "Update Expense" : "Add Expense"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (variant === "sheet" ? onDone?.() : router.back())}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  if (variant === "sheet") return formBody;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">
          {isEditing ? "Edit Expense" : "New Expense"}
        </CardTitle>
      </CardHeader>
      <CardContent>{formBody}</CardContent>
    </Card>
  );
}
