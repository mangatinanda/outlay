import { describe, expect, it } from "vitest";
import {
  ACTOR_MAX_LENGTH,
  parseActorFilter,
} from "@/lib/validators/activity-filter-schema";

describe("parseActorFilter", () => {
  it("trims a label", () => {
    expect(parseActorFilter(" Nanda ")).toBe("Nanda");
  });

  it("takes the first value of a repeated param", () => {
    expect(parseActorFilter(["A", "B"])).toBe("A");
  });

  it("treats empty, missing and non-string values as no filter", () => {
    expect(parseActorFilter("")).toBeUndefined();
    expect(parseActorFilter("   ")).toBeUndefined();
    expect(parseActorFilter(undefined)).toBeUndefined();
    expect(parseActorFilter(42)).toBeUndefined();
  });

  it("caps an oversized label", () => {
    expect(parseActorFilter("x".repeat(150))).toHaveLength(ACTOR_MAX_LENGTH);
  });
});
