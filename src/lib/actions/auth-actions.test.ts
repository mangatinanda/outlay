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
// Auth.js is mocked so the tests stay hermetic; `auth` returns the Google
// session lockAdmin consults (null = passcode-only).
const googleSession = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/auth", () => ({
  signOut: vi.fn(),
  auth: vi.fn(async () => googleSession.current),
}));

import { signOut } from "@/auth";
import { lockAdmin, verifyPasscode } from "@/lib/actions/auth-actions";
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

describe("lockAdmin", () => {
  it("drops only the passcode cookie; with a Google session it lands on the dashboard", async () => {
    googleSession.current = { user: { id: "u1", email: "u1@x.com" } };
    cookieJar.set(SESSION_COOKIE, "some-passcode-token");
    // The active-household cookie (HOUSEHOLD_COOKIE in household-queries —
    // not imported here to keep this test free of the db/env graph).
    cookieJar.set("he_household", "h1");

    await expect(lockAdmin()).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_REDIRECT.*\/dashboard/),
    });

    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
    expect(cookieJar.get("he_household")).toBe("h1");
    expect(signOut).not.toHaveBeenCalled(); // unlike logout()
  });

  it("with no Google session it goes straight to /login (no proxy bounce that leaves a stale URL)", async () => {
    googleSession.current = null;
    cookieJar.set(SESSION_COOKIE, "some-passcode-token");

    await expect(lockAdmin()).rejects.toMatchObject({
      digest: expect.stringMatching(/NEXT_REDIRECT.*\/login/),
    });
    expect(cookieJar.has(SESSION_COOKIE)).toBe(false);
  });
});
