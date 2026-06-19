import { describe, expect, it } from "vitest";
import { isOpenSignup, parseLimit } from "@/lib/limits";

describe("parseLimit", () => {
  it("returns a positive-integer override", () => {
    expect(parseLimit("5", 1000)).toBe(5);
    expect(parseLimit("250", 1000)).toBe(250);
  });

  it("falls back on absent, empty, non-numeric, zero, negative, or fractional input", () => {
    expect(parseLimit(undefined, 1000)).toBe(1000);
    expect(parseLimit("", 1000)).toBe(1000);
    expect(parseLimit("abc", 1000)).toBe(1000);
    expect(parseLimit("0", 1000)).toBe(1000);
    expect(parseLimit("-3", 1000)).toBe(1000);
    expect(parseLimit("2.5", 1000)).toBe(1000);
  });
});

describe("isOpenSignup", () => {
  it("is true only when a wildcard entry is present", () => {
    expect(isOpenSignup("*")).toBe(true);
    expect(isOpenSignup("you@x.com, *")).toBe(true);
  });

  it("is false for a normal list or an empty value", () => {
    expect(isOpenSignup("a@x.com,b@y.com")).toBe(false);
    expect(isOpenSignup("")).toBe(false);
    expect(isOpenSignup(undefined)).toBe(false);
  });
});
