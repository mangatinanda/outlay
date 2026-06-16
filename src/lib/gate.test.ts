import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret";
});

import { constantTimeEqual, signSession, verifySession } from "@/lib/gate";

const SECRET = "test-secret-for-gate-tests";

/** Re-create the legacy (pre-expiry) token format: HMAC-SHA256("authed"). */
async function legacyToken(): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode("authed"));
  return Buffer.from(sig).toString("base64url");
}

beforeAll(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("signSession / verifySession", () => {
  it("accepts a freshly signed token", async () => {
    const token = await signSession();
    expect(await verifySession(token)).toBe(true);
  });

  it("rejects a tampered token", async () => {
    const token = await signSession();
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(await verifySession(flipped)).toBe(false);
  });

  it("rejects undefined, empty, and garbage tokens", async () => {
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("garbage")).toBe(false);
    expect(await verifySession("a.b.c.d")).toBe(false);
  });

  it("rejects the legacy constant-payload token format", async () => {
    expect(await verifySession(await legacyToken())).toBe(false);
  });

  it("accepts a token younger than 30 days", async () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = await signSession(issued);
    expect(await verifySession(token, new Date("2026-01-30T00:00:00Z"))).toBe(
      true,
    );
  });

  it("rejects a token older than 30 days", async () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = await signSession(issued);
    expect(await verifySession(token, new Date("2026-02-01T00:00:00Z"))).toBe(
      false,
    );
  });

  it("rejects a token issued in the future", async () => {
    const issued = new Date("2026-06-12T00:00:00Z");
    const token = await signSession(issued);
    expect(await verifySession(token, new Date("2026-06-11T00:00:00Z"))).toBe(
      false,
    );
  });

  it("rejects a token with a forged (unsigned) timestamp", async () => {
    const token = await signSession(new Date("2026-01-01T00:00:00Z"));
    // Splice a newer timestamp into the payload without re-signing.
    const [version, , sig] = token.split(".");
    const forged = `${version}.${Math.floor(Date.now() / 1000)}.${sig}`;
    expect(await verifySession(forged)).toBe(false);
  });
});

describe("constantTimeEqual", () => {
  it("matches equal strings and rejects unequal ones", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "ab")).toBe(false);
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

describe("SESSION_VERSION cut", () => {
  it("accepts a freshly signed (v2) token", async () => {
    expect(await verifySession(await signSession())).toBe(true);
  });

  it("rejects a token minted under the old v1 version", async () => {
    // A v1-prefixed token with any signature must fail (version check or sig).
    const stale = "v1.1700000000.deadbeef";
    expect(await verifySession(stale)).toBe(false);
  });
});
