"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/expenses/category-icon";
import {
  distributeEqually,
  remainingMinor,
  SplitEditor,
  type SplitState,
} from "@/components/expenses/split-editor";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createExpense, updateExpense } from "@/lib/actions/expense-actions";
import type { Category, HouseholdMember } from "@/lib/db/schema";
import { visiblePayers } from "@/lib/members";
import { toMinorUnits } from "@/lib/money";
import { withProgress } from "@/lib/progress";
import { cn } from "@/lib/utils";
import {
  SPLIT_NOBODY_ERROR,
  SPLIT_PAYER_ERROR,
  SPLIT_SUM_ERROR,
} from "@/lib/validators/expense-splits-schema";

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
    /** Saved custom shares (major units); empty = split equally. */
    splits?: { memberId: string; amount: number }[];
  };
  variant?: "page" | "sheet";
  onDone?: () => void;
}

type SplitMode = "equal" | "custom";

/** The chip style shared by the category, payer and split pickers. */
const pillClass = (active: boolean, dense = false) =>
  cn(
    "flex shrink-0 items-center gap-2 rounded-full border text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
    dense ? "px-2 py-1.5" : "px-3 py-2",
    active
      ? "border-primary bg-primary/10 text-foreground"
      : "border-border bg-card text-muted-foreground hover:bg-muted",
  );

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
  // Hidden members are not offered as payers; the expense's current payer
  // stays so editing never silently reassigns it.
  const payers = visiblePayers(members, expense?.memberId);
  const [memberId, setMemberId] = useState(
    expense?.memberId ?? payers[0]?.id ?? "",
  );

  // Controlled so the split editor can follow the total as it is typed.
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const amountNumber = Number(amount);

  // Only settle-up participants can carry a share, and only their expenses
  // count toward balances, so a split needs a participant payer too. A saved
  // share for someone since toggled out is dropped here (the server refuses
  // that toggle while shares exist, so this is belt and braces).
  const participants = members
    .filter((m) => m.includeInSettleUp)
    .map((m) => ({ id: m.id, name: m.name }));
  const participantIds = new Set(participants.map((p) => p.id));
  const payerIsParticipant = participantIds.has(memberId);
  const savedSplits = (expense?.splits ?? []).filter((s) =>
    participantIds.has(s.memberId),
  );
  // What the editor starts from, and what comes back if the amount is typed
  // back to its saved value after a slip.
  const savedSplit: SplitState | null =
    savedSplits.length > 0
      ? {
          included: savedSplits.map((s) => s.memberId),
          shares: Object.fromEntries(
            savedSplits.map((s) => [s.memberId, s.amount.toFixed(2)]),
          ),
        }
      : null;
  const savedTotalMinor =
    expense && savedSplit ? toMinorUnits(expense.amount) : null;
  // Always show a saved split (so an edit can never silently drop it);
  // otherwise only when there are at least two people to split between.
  const showSplit = savedSplit !== null || participants.length >= 2;
  const [splitMode, setSplitMode] = useState<SplitMode>(
    savedSplit ? "custom" : "equal",
  );
  const [split, setSplit] = useState<SplitState>(
    () => savedSplit ?? { included: participants.map((p) => p.id), shares: {} },
  );
  const splitActive = showSplit && splitMode === "custom";
  const splitProblem = !splitActive
    ? null
    : !payerIsParticipant
      ? SPLIT_PAYER_ERROR
      : split.included.length === 0
        ? SPLIT_NOBODY_ERROR
        : remainingMinor(amountNumber, split) !== 0
          ? SPLIT_SUM_ERROR
          : null;

  function onAmountChange(value: string) {
    setAmount(value);
    if (splitMode !== "custom") return;
    const next = Number(value);
    if (
      savedSplit &&
      savedTotalMinor !== null &&
      Number.isFinite(next) &&
      toMinorUnits(next) === savedTotalMinor
    ) {
      setSplit(savedSplit);
      return;
    }
    // The total moved, so any hand-tuned shares are stale: start over equal.
    setSplit((s) => ({
      ...s,
      shares: distributeEqually(next, s.included),
    }));
  }

  function chooseSplitMode(mode: SplitMode) {
    setSplitMode(mode);
    if (mode === "custom") {
      setSplit((s) => {
        const included =
          s.included.length > 0 ? s.included : participants.map((p) => p.id);
        return { included, shares: distributeEqually(amountNumber, included) };
      });
    }
  }

  async function handleSubmit(formData: FormData) {
    if (splitProblem) {
      toast.error(splitProblem);
      return;
    }
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
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
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
                  className={pillClass(active)}
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
          {payers.length === 0 && (
            <p className="text-muted-foreground text-sm">
              Nobody is shown in Paid by. Turn it on for a member under Members.
            </p>
          )}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {payers.map((member) => {
              const active = member.id === memberId;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setMemberId(member.id)}
                  aria-pressed={active}
                  className={pillClass(active, true)}
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

        {showSplit && (
          <div className="space-y-2">
            <Label>Split</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => chooseSplitMode("equal")}
                aria-pressed={splitMode === "equal"}
                className={pillClass(splitMode === "equal")}
              >
                Equally
              </button>
              <button
                type="button"
                onClick={() => chooseSplitMode("custom")}
                aria-pressed={splitMode === "custom"}
                disabled={!payerIsParticipant && splitMode !== "custom"}
                className={pillClass(splitMode === "custom")}
              >
                Custom
              </button>
            </div>
            {!payerIsParticipant && (
              <p className="text-muted-foreground text-xs">
                {SPLIT_PAYER_ERROR}.
              </p>
            )}
            {splitMode === "custom" && (
              <>
                <input
                  type="hidden"
                  name="splits"
                  value={JSON.stringify(
                    split.included.map((id) => ({
                      memberId: id,
                      amount: split.shares[id] ?? "0",
                    })),
                  )}
                />
                <SplitEditor
                  participants={participants}
                  totalMajor={amountNumber}
                  state={split}
                  onChange={setSplit}
                />
              </>
            )}
          </div>
        )}
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
        <Button type="submit" disabled={loading || splitProblem !== null}>
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
