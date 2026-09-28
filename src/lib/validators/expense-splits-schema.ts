import { z } from "zod/v4";
import { toMinorUnits } from "@/lib/money";

/** Most people one expense can be split among (a household, not a wedding). */
export const MAX_SPLIT_MEMBERS = 50;

// Shared between the form's pre-submit check and the server, so the two can
// never disagree on wording.
export const SPLIT_SUM_ERROR =
  "Split amounts must add up to the expense amount";
export const SPLIT_NOBODY_ERROR = "Choose at least one person to split with";
export const SPLIT_MEMBERS_ERROR =
  "Everyone in a split must be in settle-up for this household";
export const SPLIT_PAYER_ERROR =
  "Only an expense paid by someone in settle-up can be split";

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
  .min(1, SPLIT_NOBODY_ERROR)
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
  if (splits.length === 0) return { error: SPLIT_NOBODY_ERROR };
  const sum = splits.reduce((acc, s) => acc + s.shareMinor, 0);
  if (sum !== amountMinor) return { error: SPLIT_SUM_ERROR };
  return { splits };
}
