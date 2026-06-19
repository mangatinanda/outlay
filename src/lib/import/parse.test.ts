import { describe, expect, it } from "vitest";
import {
  categorize,
  categoryPreset,
  detectColumns,
  humanizeEmail,
  parseDmyToIso,
} from "@/lib/import/parse";

describe("parseDmyToIso", () => {
  it("converts DD/MM/YYYY to ISO", () => {
    expect(parseDmyToIso("20/11/2025")).toBe("2025-11-20");
    expect(parseDmyToIso("1/1/2026")).toBe("2026-01-01");
  });

  it("ignores a trailing time component", () => {
    expect(parseDmyToIso("17/12/2025 10:34:25")).toBe("2025-12-17");
  });

  it("rejects impossible or malformed dates", () => {
    expect(parseDmyToIso("31/02/2026")).toBeNull();
    expect(parseDmyToIso("00/01/2026")).toBeNull();
    expect(parseDmyToIso("13/13/2026")).toBeNull();
    expect(parseDmyToIso("2026-01-01")).toBeNull();
    expect(parseDmyToIso("garbage")).toBeNull();
    expect(parseDmyToIso("")).toBeNull();
    // Trailing garbage after the year must be rejected, not silently truncated.
    expect(parseDmyToIso("12/05/20249")).toBeNull();
    expect(parseDmyToIso("1/2/2024junk")).toBeNull();
  });
});

describe("categorize", () => {
  it("buckets the sample data sensibly, strongest signal first", () => {
    expect(categorize("Tractor petrol")).toBe("Farming"); // tractor beats petrol
    expect(categorize("Fertilizers for palm trees")).toBe("Farming");
    expect(categorize("Goats transport charges")).toBe("Farming");
    expect(categorize("Amma surgery")).toBe("Healthcare");
    expect(categorize("Sugar and bp tablets")).toBe("Healthcare");
    expect(categorize("Bengaluru bus ticket")).toBe("Transportation");
    expect(categorize("Ather bike service")).toBe("Transportation");
    expect(categorize("Motor power bills 6 months")).toBe("Utilities");
    expect(categorize("Amma and nanna mobile recharge")).toBe("Utilities");
    expect(categorize("Washing machine Nov, Dec, Jan EMIs")).toBe("Shopping");
    expect(categorize("Waterproof paint and brush")).toBe("Shopping");
    expect(categorize("Canara bank loan renewal")).toBe("Other");
    expect(categorize("Rama temple annur")).toBe("Other");
    expect(categorize("Random expense")).toBe("Other");
  });
});

describe("categoryPreset", () => {
  it("returns a preset for known names and a fallback otherwise", () => {
    expect(categoryPreset("Farming")).toEqual({
      icon: "sprout",
      color: "#16a34a",
    });
    expect(categoryPreset("Nonexistent")).toEqual({
      icon: "receipt",
      color: "#6366f1",
    });
  });
});

describe("detectColumns", () => {
  it("maps the Google Form headers to roles", () => {
    const headers = [
      "Timestamp",
      "Email address",
      "Amount",
      "When?",
      "How?",
      "Purpose",
    ];
    expect(detectColumns(headers)).toEqual({
      amount: 2,
      date: 3, // "When?" — not "Timestamp"
      description: 5,
      method: 4,
      email: 1,
    });
  });

  it("reports -1 for missing roles", () => {
    expect(detectColumns(["foo", "bar"]).amount).toBe(-1);
  });
});

describe("humanizeEmail", () => {
  it("derives a friendly name from the local part", () => {
    expect(humanizeEmail("mangatinanda@gmail.com")).toBe("Mangatinanda");
    expect(humanizeEmail("john.q.public@x.com")).toBe("John q public");
  });
});
