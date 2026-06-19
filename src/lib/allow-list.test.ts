import { describe, expect, it } from "vitest";
import { isEmailAllowed, parseAllowList } from "@/lib/allow-list";

describe("parseAllowList", () => {
  it("splits, trims, lowercases, and drops empty segments", () => {
    expect(parseAllowList(" A@x.com, b@Y.com ,,")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(parseAllowList(undefined)).toEqual([]);
    expect(parseAllowList("")).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  const list = "alice@example.com, Bob@Example.com";

  it("allows a listed email regardless of environment", () => {
    expect(isEmailAllowed("alice@example.com", list, true)).toBe(true);
    expect(isEmailAllowed("alice@example.com", list, false)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isEmailAllowed("BOB@example.COM", list, true)).toBe(true);
  });

  it("denies an unlisted email", () => {
    expect(isEmailAllowed("mallory@example.com", list, true)).toBe(false);
    expect(isEmailAllowed("mallory@example.com", list, false)).toBe(false);
  });

  it("denies a missing email when a list is set", () => {
    expect(isEmailAllowed(null, list, false)).toBe(false);
    expect(isEmailAllowed(undefined, list, false)).toBe(false);
  });

  it("FAILS CLOSED in production when the list is empty", () => {
    expect(isEmailAllowed("anyone@example.com", undefined, true)).toBe(false);
    expect(isEmailAllowed("anyone@example.com", "", true)).toBe(false);
    expect(isEmailAllowed("anyone@example.com", " , ,", true)).toBe(false);
  });

  it("stays open in development when the list is empty (local convenience)", () => {
    expect(isEmailAllowed("anyone@example.com", undefined, false)).toBe(true);
  });

  it("allows ANY Google account when the list contains a wildcard", () => {
    expect(isEmailAllowed("anyone@example.com", "*", true)).toBe(true);
    expect(isEmailAllowed("anyone@example.com", "you@x.com, *", true)).toBe(
      true,
    );
    expect(isEmailAllowed("anyone@example.com", "*", false)).toBe(true);
  });

  it("still denies a missing email under a wildcard", () => {
    expect(isEmailAllowed(null, "*", true)).toBe(false);
    expect(isEmailAllowed(undefined, "*", true)).toBe(false);
  });
});
