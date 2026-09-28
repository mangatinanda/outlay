"use client";

import { useFormatCurrency } from "@/components/providers/currency-provider";
import { Input } from "@/components/ui/input";
import { toMinorUnits } from "@/lib/money";
import { computeShares } from "@/lib/settle-up/balances";
import { cn } from "@/lib/utils";

export interface SplitParticipant {
  id: string;
  name: string;
}

/** Who is in the split and each person's share as typed (major units). */
export interface SplitState {
  included: string[];
  shares: Record<string, string>;
}

function safeMinor(major: number): number {
  return Number.isFinite(major) && major > 0 ? toMinorUnits(major) : 0;
}

/** Equal shares of `totalMajor` among `ids`, as 2dp strings; the leftover
 *  paise go one at a time to the first ids in sort order (same rule as the
 *  balance math), so the shares always add up exactly. */
export function distributeEqually(
  totalMajor: number,
  ids: string[],
): Record<string, string> {
  const minor = computeShares(safeMinor(totalMajor), ids);
  const shares: Record<string, string> = {};
  for (const id of ids) shares[id] = ((minor.get(id) ?? 0) / 100).toFixed(2);
  return shares;
}

/** Σ shares of the people included, in minor units; blank/junk counts as 0. */
export function sumSharesMinor(state: SplitState): number {
  let sum = 0;
  for (const id of state.included) {
    const n = Number(state.shares[id]);
    if (Number.isFinite(n) && n > 0) sum += toMinorUnits(n);
  }
  return sum;
}

/** What is still unassigned (positive) or over-assigned (negative). */
export function remainingMinor(totalMajor: number, state: SplitState): number {
  return safeMinor(totalMajor) - sumSharesMinor(state);
}

export function SplitEditor({
  participants,
  totalMajor,
  state,
  onChange,
}: {
  participants: SplitParticipant[];
  totalMajor: number;
  state: SplitState;
  onChange: (next: SplitState) => void;
}) {
  const formatCurrency = useFormatCurrency();
  const remaining = remainingMinor(totalMajor, state);

  function toggle(id: string) {
    const included = state.included.includes(id)
      ? state.included.filter((x) => x !== id)
      : [...state.included, id];
    // Who is in changed, so start them over from an equal share.
    onChange({ included, shares: distributeEqually(totalMajor, included) });
  }

  function setShare(id: string, value: string) {
    onChange({ ...state, shares: { ...state.shares, [id]: value } });
  }

  return (
    <div className="space-y-1 rounded-2xl border border-border p-3">
      {participants.map((p) => {
        const on = state.included.includes(p.id);
        return (
          <div key={p.id} className="flex min-h-11 items-center gap-3">
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(p.id)}
                aria-label={`Include ${p.name}`}
                className="size-5 accent-primary"
              />
              <span className={cn(!on && "text-muted-foreground")}>
                {p.name}
              </span>
            </label>
            <Input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              aria-label={`${p.name}'s share`}
              value={on ? (state.shares[p.id] ?? "") : ""}
              disabled={!on}
              onChange={(e) => setShare(p.id, e.target.value)}
              className="h-11 w-28 text-right tabular-nums"
            />
          </div>
        );
      })}
      <p
        aria-live="polite"
        className={cn(
          "pt-1 text-sm",
          remaining === 0 ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {state.included.length === 0
          ? "Choose at least one person"
          : remaining === 0
            ? "Adds up"
            : remaining > 0
              ? `${formatCurrency(remaining / 100)} left to assign`
              : `${formatCurrency(-remaining / 100)} over`}
      </p>
    </div>
  );
}
