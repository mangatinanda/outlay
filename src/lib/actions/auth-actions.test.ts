import { describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
  process.env.HOUSEHOLD_PASSCODE = "correct-horse";
  return new Map<string, string>();
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));
// verifyPasscode doesn't use Auth.js; mock it out so the test stays hermetic.
vi.mock("@/auth", () => ({ signOut: vi.fn() }));

import { verifyPasscode } from "@/lib/actions/auth-actions";
import { SESSION_COOKIE, verifySession } from "@/lib/gate";

function form(passcode: string) {
  const fd = new FormData();
  fd.set("passcode", passcode);
  return fd;
}

describe("verifyPasscode", () => {
  it("delays ~1s on a wrong passcode (online brute-force damping)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const start = performance.now();
    const result = await verifyPasscode(null, form("wrong-passcode"));
    const elapsed = performance.now() - start;

    expect(result).toEqual({ error: "Incorrect passcode." });
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(errorSpy).toHaveBeenCalled(); // failed attempts are logged
    errorSpy.mockRestore();
  });

  it("sets a valid session cookie and redirects on the correct passcode", async () => {
    await expect(
      verifyPasscode(null, form("correct-horse")),
    ).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
    expect(await verifySession(cookieJar.get(SESSION_COOKIE))).toBe(true);
  });
});
