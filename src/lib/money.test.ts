import { describe, expect, it } from "vitest";
import { toMinorUnits } from "@/lib/money";

describe("toMinorUnits", () => {
  it("converts major units to integer minor units", () => {
    expect(toMinorUnits(12.34)).toBe(1234);
    expect(toMinorUnits(100)).toBe(10000);
    expect(toMinorUnits(1500)).toBe(150000);
  });

  it("is exact for float-noisy inputs", () => {
    // 0.07 * 100 === 7.000000000000001 in IEEE-754; must still yield 7.
    expect(toMinorUnits(0.07)).toBe(7);
    expect(toMinorUnits(0.1)).toBe(10);
    expect(toMinorUnits(85.5)).toBe(8550);
  });

  it("always returns an integer", () => {
    expect(Number.isInteger(toMinorUnits(19.99))).toBe(true);
  });
});
