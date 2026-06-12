import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/components/shared/currency-display";

describe("formatCurrency", () => {
  it("formats INR with en-IN lakh/crore grouping", () => {
    expect(formatCurrency(150000, "INR")).toBe("₹1,50,000.00");
  });

  it("formats other currencies with en-US grouping", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
  });

  it("defaults to INR", () => {
    expect(formatCurrency(4)).toBe("₹4.00");
  });

  it("accepts Intl options for compact displays like axis ticks", () => {
    expect(
      formatCurrency(4, "INR", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe("₹4");
  });
});
