import { and, eq, inArray, notExists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  expenseSplits,
  expenses,
  householdMembers,
  settlements,
} from "@/lib/db/schema";
import { computeNetBalances, simplifyDebts } from "@/lib/settle-up/balances";

export async function getSettleUp(householdId: string) {
  const members = await db
    .select({
      id: householdMembers.id,
      name: householdMembers.name,
      avatar: householdMembers.avatar,
      includeInSettleUp: householdMembers.includeInSettleUp,
    })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const participants = members.filter((m) => m.includeInSettleUp);
  const participantIds = participants.map((m) => m.id);

  // Only participants' expenses are settleable. Skip entirely when there are
  // no participants (inArray with an empty array is a SQL footgun).
  const participantPaid = and(
    eq(expenses.householdId, householdId),
    inArray(expenses.memberId, participantIds),
  );
  // None of these depend on each other, so they go out together (each is a
  // network round-trip against Turso).
  const [paidRows, [{ equalPoolMinor }], customShares, settlementRows] =
    await Promise.all([
      participantIds.length === 0
        ? []
        : db
            .select({
              memberId: expenses.memberId,
              paidMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)`,
            })
            .from(expenses)
            .where(participantPaid)
            .groupBy(expenses.memberId),
      // Participant-paid expenses WITHOUT split rows form the equal pool …
      participantIds.length === 0
        ? [{ equalPoolMinor: 0 }]
        : db
            .select({
              equalPoolMinor: sql<number>`coalesce(sum(${expenses.amountMinor}), 0)`,
            })
            .from(expenses)
            .where(
              and(
                participantPaid,
                notExists(
                  db
                    .select({ one: sql`1` })
                    .from(expenseSplits)
                    .where(eq(expenseSplits.expenseId, expenses.id)),
                ),
              ),
            ),
      // … and the rest contribute their explicit per-member shares.
      participantIds.length === 0
        ? []
        : db
            .select({
              memberId: expenseSplits.memberId,
              shareMinor: sql<number>`coalesce(sum(${expenseSplits.shareMinor}), 0)`,
            })
            .from(expenseSplits)
            .innerJoin(expenses, eq(expenseSplits.expenseId, expenses.id))
            .where(participantPaid)
            .groupBy(expenseSplits.memberId),
      db
        .select({
          fromMemberId: settlements.fromMemberId,
          toMemberId: settlements.toMemberId,
          amountMinor: settlements.amountMinor,
        })
        .from(settlements)
        .where(eq(settlements.householdId, householdId)),
    ]);

  const nets = computeNetBalances({
    participantIds,
    paid: paidRows,
    equalPoolMinor,
    customShares,
    settlements: settlementRows,
  });
  const transfers = simplifyDebts(nets);

  const balances = nets.map((n) => {
    const m = participants.find((p) => p.id === n.memberId);
    return {
      memberId: n.memberId,
      name: m?.name ?? "",
      avatar: m?.avatar ?? null,
      net: n.netMinor / 100,
    };
  });

  const suggestions = transfers.map((t) => ({
    fromId: t.fromMemberId,
    fromName: nameById.get(t.fromMemberId) ?? "",
    toId: t.toMemberId,
    toName: nameById.get(t.toMemberId) ?? "",
    amount: t.amountMinor / 100,
  }));

  return { balances, suggestions, settledUp: transfers.length === 0 };
}

export async function getSettlements(householdId: string) {
  const rows = await db
    .select({
      id: settlements.id,
      fromMemberId: settlements.fromMemberId,
      toMemberId: settlements.toMemberId,
      amount: sql<number>`${settlements.amountMinor} / 100.0`,
      date: settlements.date,
      note: settlements.note,
    })
    .from(settlements)
    .where(eq(settlements.householdId, householdId))
    .orderBy(sql`${settlements.date} desc`);

  const members = await db
    .select({ id: householdMembers.id, name: householdMembers.name })
    .from(householdMembers)
    .where(eq(householdMembers.householdId, householdId));
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  return rows.map((r) => ({
    id: r.id,
    fromName: nameById.get(r.fromMemberId) ?? "",
    toName: nameById.get(r.toMemberId) ?? "",
    amount: r.amount,
    date: r.date,
    note: r.note,
  }));
}
