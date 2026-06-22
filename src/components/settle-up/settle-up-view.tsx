"use client";

import { ArrowRight, Check, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSettlement,
  deleteSettlement,
} from "@/lib/actions/settlement-actions";
import { cn } from "@/lib/utils";

interface Balance {
  memberId: string;
  name: string;
  net: number;
}
interface Suggestion {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
}
interface HistoryRow {
  id: string;
  fromName: string;
  toName: string;
  amount: number;
  date: string;
  note: string | null;
}

export function SettleUpView({
  balances,
  suggestions,
  settledUp,
  history,
  participants,
}: {
  balances: Balance[];
  suggestions: Suggestion[];
  settledUp: boolean;
  history: HistoryRow[];
  participants: { id: string; name: string }[];
}) {
  const formatCurrency = useFormatCurrency();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [prefill, setPrefill] = useState<{
    fromId: string;
    toId: string;
    amount: string;
  }>({
    fromId: participants[0]?.id ?? "",
    toId: participants[1]?.id ?? "",
    amount: "",
  });

  function openRecord(p?: Suggestion) {
    setPrefill(
      p
        ? { fromId: p.fromId, toId: p.toId, amount: String(p.amount) }
        : {
            fromId: participants[0]?.id ?? "",
            toId: participants[1]?.id ?? "",
            amount: "",
          },
    );
    setOpen(true);
  }

  async function handleRecord(formData: FormData) {
    setLoading(true);
    try {
      const res = await createSettlement(formData);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Settlement recorded");
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const res = await deleteSettlement(id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Settlement removed");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Balances</CardTitle>
          <Button variant="outline" size="sm" onClick={() => openRecord()}>
            Record a payment
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {balances.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one is in settle-up yet. Toggle members in from the Members
              page.
            </p>
          ) : (
            balances.map((b) => (
              <div
                key={b.memberId}
                className="flex items-center justify-between"
              >
                <span>{b.name}</span>
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    b.net > 0 && "text-primary",
                    b.net < 0 && "text-destructive",
                  )}
                >
                  {b.net > 0 ? "is owed " : b.net < 0 ? "owes " : "settled "}
                  {b.net !== 0 && formatCurrency(Math.abs(b.net))}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suggested payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {settledUp ? (
            <p className="flex items-center gap-2 text-muted-foreground text-sm">
              <Check className="h-4 w-4 text-primary" /> All settled up 🎉
            </p>
          ) : (
            suggestions.map((s) => (
              <div
                key={`${s.fromId}-${s.toId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2"
              >
                <span className="flex items-center gap-2 text-sm">
                  {s.fromName} <ArrowRight className="h-3.5 w-3.5" /> {s.toName}
                  <span className="font-medium tabular-nums">
                    {formatCurrency(s.amount)}
                  </span>
                </span>
                <Button size="sm" onClick={() => openRecord(s)}>
                  Settle up
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-muted-foreground">
                  {h.date}: {h.fromName} → {h.toName}{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {formatCurrency(h.amount)}
                  </span>
                  {h.note ? ` · ${h.note}` : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  aria-label="Delete settlement"
                  onClick={() => handleDelete(h.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a payment</DialogTitle>
          </DialogHeader>
          <form action={handleRecord} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fromMemberId">From</Label>
                <select
                  id="fromMemberId"
                  name="fromMemberId"
                  defaultValue={prefill.fromId}
                  className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="toMemberId">To</Label>
                <select
                  id="toMemberId"
                  name="toMemberId"
                  defaultValue={prefill.toId}
                  className="h-11 w-full rounded-md border border-input bg-card px-2 text-sm"
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={prefill.amount}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={new Date().toLocaleDateString("en-CA")}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" name="note" placeholder="e.g. UPI" />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Record"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
