import { z } from "zod/v4";
import { toMinorUnits } from "@/lib/money";

/** Most people one expense can be split among (a household, not a wedding). */
export const MAX_SPLIT_MEMBERS = 50;

const shareAmount = z.coerce
  .number()
  .min(0, "A share can't be negative")
  .max(100_000_000, "Amount is too large")
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
    "Shares can have at most 2 decimal places",
  );

export const expenseSplitsSchema = z
  .array(z.object({ memberId: z.string().min(1).max(64), amount: shareAmount }))
  .min(1, "Choose at least one person to split with")
  .max(MAX_SPLIT_MEMBERS, "Too many people in one split")
  .refine(
    (rows) => new Set(rows.map((r) => r.memberId)).size === rows.length,
    "Each person can appear only once in a split",
  );

export interface SplitInput {
  memberId: string;
  shareMinor: number;
}

/**
 * Read the form's `splits` field (a JSON array of `{ memberId, amount }` in
 * major units). Absent/empty → `{ splits: null }` = equal split. Otherwise the
 * non-zero shares, in minor units, which must sum exactly to `amountMinor`.
 */
export function parseSplitsField(
  raw: unknown,
  amountMinor: number,
): { splits: SplitInput[] | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { splits: null };
  if (typeof raw !== "string") return { error: "Invalid split" };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Invalid split" };
  }
  const parsed = expenseSplitsSchema.safeParse(json);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const splits = parsed.data
    .map((s) => ({ memberId: s.memberId, shareMinor: toMinorUnits(s.amount) }))
    .filter((s) => s.shareMinor > 0);
  if (splits.length === 0) {
    return { error: "Choose at least one person to split with" };
  }
  const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
  if (sum !== amountMinor) {
    return { error: "Split amounts must add up to the expense amount" };
  }
  return { splits };
}
