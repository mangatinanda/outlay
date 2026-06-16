import { describe, expect, it } from "vitest";
import { applyUserIdToSession } from "@/lib/auth/callbacks";

describe("applyUserIdToSession", () => {
  it("copies the userId onto session.user.id", () => {
    const session = applyUserIdToSession(
      { user: { email: "a@b.com" } },
      "user-123",
    );
    expect(session.user.id).toBe("user-123");
  });

  it("no-ops when the userId is undefined", () => {
    const session = applyUserIdToSession(
      { user: { email: "a@b.com" } },
      undefined,
    );
    expect(session.user.id).toBeUndefined();
  });

  it("no-ops when there is no user", () => {
    const session = applyUserIdToSession({ user: null }, "user-123");
    expect(session.user).toBeNull();
  });
});
