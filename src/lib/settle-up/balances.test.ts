import { describe, expect, it } from "vitest";
import {
  computeNetBalances,
  computeShares,
  simplifyDebts,
} from "@/lib/settle-up/balances";

describe("computeShares", () => {
  it("splits evenly when divisible", () => {
    const s = computeShares(900, ["a", "b", "c"]);
    expect([...s.values()]).toEqual([300, 300, 300]);
  });
  it("distributes the remainder one minor unit at a time (by id order)", () => {
    const s = computeShares(1000, ["a", "b", "c"]); // 1000/3 = 333 r1
    expect(s.get("a")).toBe(334);
    expect(s.get("b")).toBe(333);
    expect(s.get("c")).toBe(333);
    expect([...s.values()].reduce((x, y) => x + y, 0)).toBe(1000);
  });
  it("returns empty for no participants", () => {
    expect(computeShares(500, []).size).toBe(0);
  });
});

describe("computeNetBalances", () => {
  it("nets paid minus equal share; balances sum to zero", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b", "c"],
      paid: [
        { memberId: "a", paidMinor: 6000 },
        { memberId: "b", paidMinor: 3000 },
      ],
      settlements: [],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    expect(byId.a).toBe(3000); // paid 6000, share 3000
    expect(byId.b).toBe(0);
    expect(byId.c).toBe(-3000);
    expect(nets.reduce((s, n) => s + n.netMinor, 0)).toBe(0);
  });
  it("ignores expenses paid by non-participants", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [
        { memberId: "a", paidMinor: 1000 },
        { memberId: "z", paidMinor: 5000 }, // z not a participant
      ],
      settlements: [],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    // settleable total = 1000 only; share 500 each
    expect(byId.a).toBe(500);
    expect(byId.b).toBe(-500);
  });
  it("applies settlements (payer's debt shrinks, receiver's credit shrinks)", () => {
    const nets = computeNetBalances({
      participantIds: ["a", "b"],
      paid: [{ memberId: "a", paidMinor: 1000 }],
      settlements: [{ fromMemberId: "b", toMemberId: "a", amountMinor: 500 }],
    });
    const byId = Object.fromEntries(nets.map((n) => [n.memberId, n.netMinor]));
    expect(byId.a).toBe(0);
    expect(byId.b).toBe(0);
  });
});

describe("simplifyDebts", () => {
  it("produces transfers that zero everyone out", () => {
    const transfers = simplifyDebts([
      { memberId: "a", netMinor: 3000 },
      { memberId: "b", netMinor: 0 },
      { memberId: "c", netMinor: -3000 },
    ]);
    expect(transfers).toEqual([
      { fromMemberId: "c", toMemberId: "a", amountMinor: 3000 },
    ]);
  });
  it("handles multiple debtors/creditors with <= n-1 transfers", () => {
    const transfers = simplifyDebts([
      { memberId: "a", netMinor: 500 },
      { memberId: "b", netMinor: 500 },
      { memberId: "c", netMinor: -1000 },
    ]);
    expect(transfers.length).toBeLessThanOrEqual(2);
    const paidBy = (id: string) =>
      transfers
        .filter((t) => t.fromMemberId === id)
        .reduce((s, t) => s + t.amountMinor, 0);
    expect(paidBy("c")).toBe(1000); // c (the sole debtor) pays out 1000 total
  });
  it("returns nothing when all settled", () => {
    expect(
      simplifyDebts([
        { memberId: "a", netMinor: 0 },
        { memberId: "b", netMinor: 0 },
      ]),
    ).toEqual([]);
  });
});
