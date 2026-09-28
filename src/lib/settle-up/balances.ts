/**
 * Pure settle-up math (integer minor units; see spec). Each participant's
 * share is two parts: an equal slice of the "equal pool" (participant-paid
 * expenses with no split rows) plus the sum of their explicit shares from
 * expenses that were split by hand. That share is netted against what they
 * paid and against recorded settlements, then a greedy pass simplifies debts.
 */

export interface MemberPaid {
  memberId: string;
  paidMinor: number;
}

export interface MemberShare {
  memberId: string;
  shareMinor: number;
}

export interface SettlementRow {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

export interface Balance {
  memberId: string;
  netMinor: number;
}

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountMinor: number;
}

/** Equal shares of `totalMinor` across participants, distributing the leftover
 *  one minor unit at a time (deterministic id order) so shares sum to total. */
export function computeShares(
  totalMinor: number,
  participantIds: string[],
): Map<string, number> {
  const shares = new Map<string, number>();
  const n = participantIds.length;
  if (n === 0) return shares;
  const base = Math.floor(totalMinor / n);
  let remainder = totalMinor - base * n;
  for (const id of [...participantIds].sort()) {
    shares.set(id, base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return shares;
}

/** Net balance per participant: paid − fair share + settled-out − settled-in.
 *  Only expenses paid by a participant count toward the settleable total. */
export function computeNetBalances(input: {
  participantIds: string[];
  paid: MemberPaid[];
  /** Sum of participant-paid expenses WITHOUT split rows. Defaults to the
   *  total of `paid`, i.e. everything is split equally (legacy callers). */
  equalPoolMinor?: number;
  /** Per-member shares from expenses WITH split rows (participant-paid only).
   *  Shares for non-participants are ignored, like their paid expenses. */
  customShares?: MemberShare[];
  settlements: SettlementRow[];
}): Balance[] {
  const participants = new Set(input.participantIds);
  const paidByMember = new Map<string, number>();
  let total = 0;
  for (const p of input.paid) {
    if (!participants.has(p.memberId)) continue;
    paidByMember.set(
      p.memberId,
      (paidByMember.get(p.memberId) ?? 0) + p.paidMinor,
    );
    total += p.paidMinor;
  }
  const equalShares = computeShares(
    input.equalPoolMinor ?? total,
    input.participantIds,
  );
  const custom = new Map<string, number>();
  for (const s of input.customShares ?? []) {
    if (!participants.has(s.memberId)) continue;
    custom.set(s.memberId, (custom.get(s.memberId) ?? 0) + s.shareMinor);
  }
  const out = new Map<string, number>();
  const inn = new Map<string, number>();
  // Edge: if a member is toggled out of settle-up AFTER a settlement involving them, only the
  // remaining participant's side is counted, so balances may not sum to zero.
  // Accepted for v1 (the toggle is retroactive by design).
  for (const s of input.settlements) {
    if (participants.has(s.fromMemberId)) {
      out.set(s.fromMemberId, (out.get(s.fromMemberId) ?? 0) + s.amountMinor);
    }
    if (participants.has(s.toMemberId)) {
      inn.set(s.toMemberId, (inn.get(s.toMemberId) ?? 0) + s.amountMinor);
    }
  }
  return input.participantIds.map((id) => ({
    memberId: id,
    netMinor:
      (paidByMember.get(id) ?? 0) -
      (equalShares.get(id) ?? 0) -
      (custom.get(id) ?? 0) +
      (out.get(id) ?? 0) -
      (inn.get(id) ?? 0),
  }));
}

/** Greedy minimal-ish set of transfers to zero out balances (≤ n−1). */
export function simplifyDebts(balances: Balance[]): Transfer[] {
  const creditors = balances
    .filter((b) => b.netMinor > 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => b.netMinor - a.netMinor);
  const debtors = balances
    .filter((b) => b.netMinor < 0)
    .map((b) => ({ ...b }))
    .sort((a, b) => a.netMinor - b.netMinor);
  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci];
    const debt = debtors[di];
    const amount = Math.min(credit.netMinor, -debt.netMinor);
    if (amount > 0) {
      transfers.push({
        fromMemberId: debt.memberId,
        toMemberId: credit.memberId,
        amountMinor: amount,
      });
      credit.netMinor -= amount;
      debt.netMinor += amount;
    }
    if (credit.netMinor === 0) ci++;
    if (debt.netMinor === 0) di++;
  }
  return transfers;
}
