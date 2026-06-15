import { describe, expect, it } from "vitest";
import { SWIPE_REVEAL_PX, shouldRevealDelete } from "./swipe-threshold";

describe("shouldRevealDelete", () => {
  it("does not reveal for small left drags", () => {
    expect(shouldRevealDelete(-10)).toBe(false);
  });
  it("reveals once the left drag passes the threshold", () => {
    expect(shouldRevealDelete(-(SWIPE_REVEAL_PX + 1))).toBe(true);
  });
  it("never reveals on right drags", () => {
    expect(shouldRevealDelete(120)).toBe(false);
  });
  it("treats exactly the threshold as not yet revealed", () => {
    expect(shouldRevealDelete(-SWIPE_REVEAL_PX)).toBe(false);
  });
});
