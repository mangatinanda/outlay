import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
  return new Map<string, string>();
});

// Mutable mock session the @/auth mock returns.
const authState = vi.hoisted(() => ({ session: null as unknown }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined,
    set: () => {},
    delete: () => {},
  }),
}));
vi.mock("@/auth", () => ({ auth: async () => authState.session }));

import { getCurrentActor } from "@/lib/auth/actor";
import { SESSION_COOKIE, signSession } from "@/lib/gate";

beforeEach(() => {
  cookieJar.clear();
  authState.session = null;
});

describe("getCurrentActor", () => {
  it("returns superadmin for a valid passcode cookie", async () => {
    cookieJar.set(SESSION_COOKIE, await signSession());
    expect(await getCurrentActor()).toEqual({ kind: "superadmin" });
  });

  it("returns a user for a Google session with id + email", async () => {
    authState.session = { user: { id: "u1", email: "a@b.com" } };
    expect(await getCurrentActor()).toEqual({
      kind: "user",
      userId: "u1",
      email: "a@b.com",
    });
  });

  it("prefers superadmin when both a passcode cookie and a session exist", async () => {
    cookieJar.set(SESSION_COOKIE, await signSession());
    authState.session = { user: { id: "u1", email: "a@b.com" } };
    expect(await getCurrentActor()).toEqual({ kind: "superadmin" });
  });

  it("returns null with neither", async () => {
    expect(await getCurrentActor()).toBeNull();
  });
});
