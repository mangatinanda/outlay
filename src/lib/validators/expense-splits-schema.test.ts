import { describe, expect, it } from "vitest";
import { parseSplitsField } from "@/lib/validators/expense-splits-schema";

describe("parseSplitsField", () => {
  it("treats a missing or empty field as an equal split", () => {
    expect(parseSplitsField(null, 1000)).toEqual({ splits: null });
    expect(parseSplitsField(undefined, 1000)).toEqual({ splits: null });
    expect(parseSplitsField("", 1000)).toEqual({ splits: null });
  });

  it("parses shares in minor units and drops zero rows", () => {
    const res = parseSplitsField(
      JSON.stringify([
        { memberId: "a", amount: "2.50" },
        { memberId: "b", amount: "7.50" },
        { memberId: "c", amount: "0" },
      ]),
      1000,
    );
    expect(res).toEqual({
      splits: [
        { memberId: "a", shareMinor: 250 },
        { memberId: "b", shareMinor: 750 },
      ],
    });
  });

  it("rejects shares that do not add up to the amount", () => {
    const res = parseSplitsField(
      JSON.stringify([{ memberId: "a", amount: "9.99" }]),
      1000,
    );
    expect(res).toEqual({
      error: "Split amounts must add up to the expense amount",
    });
  });

  it("rejects a member listed twice, malformed JSON, and negative shares", () => {
    expect(
      parseSplitsField(
        JSON.stringify([
          { memberId: "a", amount: 5 },
          { memberId: "a", amount: 5 },
        ]),
        1000,
      ),
    ).toEqual({ error: "Each person can appear only once in a split" });
    expect(parseSplitsField("{nope", 1000)).toEqual({ error: "Invalid split" });
    expect(parseSplitsField(42, 1000)).toEqual({ error: "Invalid split" });
    expect(
      parseSplitsField(
        JSON.stringify([
          { memberId: "a", amount: -1 },
          { memberId: "b", amount: 11 },
        ]),
        1000,
      ),
    ).toEqual({ error: "A share can't be negative" });
  });

  it("rejects a split with nobody in it", () => {
    expect(parseSplitsField(JSON.stringify([]), 1000)).toEqual({
      error: "Choose at least one person to split with",
    });
    expect(
      parseSplitsField(JSON.stringify([{ memberId: "a", amount: 0 }]), 1000),
    ).toEqual({ error: "Choose at least one person to split with" });
  });

  it("rejects more than two decimal places in a share", () => {
    expect(
      parseSplitsField(
        JSON.stringify([
          { memberId: "a", amount: "3.333" },
          { memberId: "b", amount: "6.667" },
        ]),
        1000,
      ),
    ).toEqual({ error: "Shares can have at most 2 decimal places" });
  });
});
