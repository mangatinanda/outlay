import { describe, expect, it } from "vitest";
import { formatRows, safeFilename, toCsv } from "@/lib/export/format";

const fixture = [
  {
    date: "2026-06-15",
    description: "Weekly groceries",
    categoryName: "Groceries",
    memberName: "Alice",
    amount: 85.5,
    notes: "Farmers' market",
  },
  {
    date: "2026-06-14",
    description: 'Coffee, "the good kind"', // quotes + comma → must be escaped
    categoryName: "Dining Out",
    memberName: "Bob",
    amount: 4.25,
    notes: null,
  },
  {
    date: "2026-06-13",
    description: "Multi-line\nnote test",
    categoryName: "Misc",
    memberName: "Alice",
    amount: 10,
    notes: "Line 1\nLine 2",
  },
];

describe("formatRows", () => {
  it("maps expense records to typed export rows in declared order", () => {
    const rows = formatRows(fixture);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      Date: "2026-06-15",
      Description: "Weekly groceries",
      Category: "Groceries",
      Member: "Alice",
      Amount: 85.5,
      Notes: "Farmers' market",
    });
    expect(rows[1].Notes).toBe(""); // null → empty string
  });
});

describe("toCsv", () => {
  it("emits a header row followed by one data row per record", () => {
    // Single-line records only — a record with an embedded newline legitimately
    // splits into multiple lines, so naive line-counting needs a real parser.
    const csv = toCsv(formatRows(fixture.slice(0, 2)));
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Date,Description,Category,Member,Amount,Notes");
    expect(lines).toHaveLength(3); // 1 header + 2 rows
  });

  it("quotes values containing commas, quotes, or newlines and doubles inner quotes", () => {
    const csv = toCsv(formatRows(fixture));
    // Row 2: contains a comma AND quotes → wrapped + inner quotes doubled
    expect(csv).toContain('"Coffee, ""the good kind"""');
    // Row 3: contains newlines → wrapped
    expect(csv).toContain('"Multi-line\nnote test"');
    expect(csv).toContain('"Line 1\nLine 2"');
  });

  it("emits Amount as a plain number (no currency symbol)", () => {
    const csv = toCsv(formatRows(fixture));
    // Amount column for row 1 is 85.5 with no symbol
    expect(csv).toContain(",85.5,");
    expect(csv).not.toMatch(/[₹$€£]/);
  });

  it("returns just the header when there are no rows", () => {
    expect(toCsv([])).toBe("Date,Description,Category,Member,Amount,Notes");
  });
});

describe("safeFilename", () => {
  it("slugifies household + date + ext", () => {
    expect(safeFilename("Ontillu Home", "2026-06-17", "csv")).toBe(
      "outlay-ontillu-home-2026-06-17.csv",
    );
  });

  it("strips path separators and other unsafe characters", () => {
    expect(safeFilename("My/Home: Beach!", "2026-06-17", "pdf")).toBe(
      "outlay-my-home-beach-2026-06-17.pdf",
    );
  });

  it("collapses runs of dashes and trims them from the slug", () => {
    expect(safeFilename("--A   B--", "2026-06-17", "xlsx")).toBe(
      "outlay-a-b-2026-06-17.xlsx",
    );
  });

  it("falls back to 'household' when the name slugifies to empty", () => {
    expect(safeFilename("***", "2026-06-17", "csv")).toBe(
      "outlay-household-2026-06-17.csv",
    );
  });
});
