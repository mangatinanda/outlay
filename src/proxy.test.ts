import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
});
// proxy.ts imports @/auth; keep the test hermetic.
vi.mock("@/auth", () => ({ auth: (fn: unknown) => fn }));

import { config } from "@/proxy";

describe("proxy matcher", () => {
  it("excludes /admin so the passcode login is reachable unauthenticated", () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain("admin");
    expect(pattern).toMatch(/login\|admin|admin\|login/);
  });
});
