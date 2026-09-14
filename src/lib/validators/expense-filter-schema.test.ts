import { describe, expect, it } from "vitest";
import {
  countActiveFilters,
  filtersToSearchParams,
  parseExpenseFilters,
} from "@/lib/validators/expense-filter-schema";

describe("parseExpenseFilters", () => {
  it("reads every supported filter from the query string", () => {
    const f = parseExpenseFilters({
      from: "2026-01-01",
      to: "2026-01-31",
      category: "c1",
      member: "m1",
      q: "sofa",
    });
    expect(f).toEqual({
      from: "2026-01-01",
      to: "2026-01-31",
      category: "c1",
      member: "m1",
      q: "sofa",
    });
  });

  it("returns an empty filter set for no params", () => {
    expect(parseExpenseFilters({})).toEqual({});
    expect(countActiveFilters(parseExpenseFilters({}))).toBe(0);
  });

  it("drops malformed dates instead of throwing", () => {
    // A hand-edited URL must never 500 the page.
    expect(
      parseExpenseFilters({ from: "yesterday", to: "2026-13-45" }),
    ).toEqual({});
  });

  it("swaps a reversed range so from <= to", () => {
    expect(
      parseExpenseFilters({ from: "2026-03-01", to: "2026-01-01" }),
    ).toEqual({ from: "2026-01-01", to: "2026-03-01" });
  });

  it("trims search text and ignores a blank or over-long query", () => {
    expect(parseExpenseFilters({ q: "  sofa  " }).q).toBe("sofa");
    expect(parseExpenseFilters({ q: "   " }).q).toBeUndefined();
    expect(parseExpenseFilters({ q: "x".repeat(200) }).q).toHaveLength(100);
  });

  it("takes the first value when a param repeats", () => {
    expect(parseExpenseFilters({ category: ["c1", "c2"] }).category).toBe("c1");
  });

  it("counts a date range as one active filter", () => {
    expect(
      countActiveFilters({ from: "2026-01-01", to: "2026-01-31", q: "sofa" }),
    ).toBe(2);
  });
});

describe("filtersToSearchParams", () => {
  it("round-trips through the query string", () => {
    const filters = { from: "2026-01-01", category: "c1", q: "sofa" };
    const qs = filtersToSearchParams(filters).toString();
    expect(
      parseExpenseFilters(Object.fromEntries(new URLSearchParams(qs))),
    ).toEqual(filters);
  });

  it("omits empty values so the URL stays clean", () => {
    expect(filtersToSearchParams({}).toString()).toBe("");
    expect(filtersToSearchParams({ q: "" }).toString()).toBe("");
  });
});
