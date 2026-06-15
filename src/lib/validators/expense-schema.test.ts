import { describe, expect, it } from "vitest";
import { expenseSchema } from "@/lib/validators/expense-schema";

const base = {
  amount: "12.34",
  description: "Lunch",
  categoryId: "cat_1",
  memberId: "mem_1",
  date: "2026-06-11",
  notes: "",
};

describe("expenseSchema.amount", () => {
  it("accepts a normal 2-decimal amount", () => {
    const r = expenseSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.amount).toBe(12.34);
  });

  it("accepts amounts whose float repr is imprecise (0.07)", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "0.07" }).success).toBe(
      true,
    );
  });

  it("rejects Infinity and astronomically large values", () => {
    expect(
      expenseSchema.safeParse({ ...base, amount: "Infinity" }).success,
    ).toBe(false);
    expect(expenseSchema.safeParse({ ...base, amount: "1e308" }).success).toBe(
      false,
    );
  });

  it("rejects zero and negative amounts", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "0" }).success).toBe(
      false,
    );
    expect(expenseSchema.safeParse({ ...base, amount: "-5" }).success).toBe(
      false,
    );
  });

  it("rejects more than 2 decimal places", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "10.999" }).success).toBe(
      false,
    );
  });

  it("rejects non-numeric input", () => {
    expect(expenseSchema.safeParse({ ...base, amount: "abc" }).success).toBe(
      false,
    );
  });
});

describe("expenseSchema.date", () => {
  it("accepts a valid ISO calendar date", () => {
    expect(
      expenseSchema.safeParse({ ...base, date: "2026-06-11" }).success,
    ).toBe(true);
  });

  it("rejects garbage and non-ISO formats", () => {
    expect(expenseSchema.safeParse({ ...base, date: "garbage" }).success).toBe(
      false,
    );
    expect(
      expenseSchema.safeParse({ ...base, date: "11-06-2026" }).success,
    ).toBe(false);
    expect(
      expenseSchema.safeParse({ ...base, date: "2026-13-45" }).success,
    ).toBe(false);
  });
});

describe("expenseSchema basics", () => {
  it("requires a description", () => {
    expect(expenseSchema.safeParse({ ...base, description: "" }).success).toBe(
      false,
    );
  });
});
