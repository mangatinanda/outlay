import { describe, expect, it } from "vitest";
import { distributeEqually, remainingMinor } from "./split-editor";

describe("distributeEqually", () => {
  it("gives the leftover paise to the first ids in sort order", () => {
    expect(distributeEqually(10, ["b", "a", "c"])).toEqual({
      a: "3.34",
      b: "3.33",
      c: "3.33",
    });
  });

  it("handles nobody and a blank amount", () => {
    expect(distributeEqually(10, [])).toEqual({});
    expect(distributeEqually(Number.NaN, ["a"])).toEqual({ a: "0.00" });
  });
});

describe("remainingMinor", () => {
  it("is zero when the shares add up, ignoring people left out", () => {
    expect(
      remainingMinor(10, {
        included: ["a", "b"],
        shares: { a: "4", b: "6", c: "99" },
      }),
    ).toBe(0);
  });

  it("treats blank or junk shares as zero", () => {
    expect(
      remainingMinor(10, { included: ["a", "b"], shares: { a: "4", b: "" } }),
    ).toBe(600);
    expect(remainingMinor(10, { included: ["a"], shares: { a: "abc" } })).toBe(
      1000,
    );
  });

  it("goes negative when too much is assigned", () => {
    expect(
      remainingMinor(9, { included: ["a", "b"], shares: { a: "5", b: "6" } }),
    ).toBe(-200);
  });
});
