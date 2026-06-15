import { describe, expect, it } from "vitest";
import { isNavItemActive } from "./mobile-nav-active";

describe("isNavItemActive", () => {
  it("matches the Add item only on the exact /expenses/new path", () => {
    expect(isNavItemActive("/expenses/new", "/expenses/new")).toBe(true);
    expect(isNavItemActive("/expenses/new", "/expenses")).toBe(false);
    expect(isNavItemActive("/expenses/new", "/expenses/123")).toBe(false);
  });

  it("prefix-matches non-Add items", () => {
    expect(isNavItemActive("/expenses", "/expenses")).toBe(true);
    expect(isNavItemActive("/expenses", "/expenses/123")).toBe(true);
    expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavItemActive("/categories", "/dashboard")).toBe(false);
  });

  it("does not let /expenses swallow the /expenses/new route check", () => {
    // On /expenses/new, the /expenses item is still prefix-active (expected),
    // but the /expenses/new item is exact-active.
    expect(isNavItemActive("/expenses", "/expenses/new")).toBe(true);
    expect(isNavItemActive("/expenses/new", "/expenses/new")).toBe(true);
  });
});
