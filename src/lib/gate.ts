// Shared access-gate helpers. Uses only the Web Crypto API so the same code
// runs in Edge middleware and in Node Server Actions. No JWT library needed:
// the session cookie is `v1.<issued-at>.<HMAC-SHA256 signature>`, which an
// attacker cannot forge without AUTH_SECRET and which expires server-side
// after SESSION_MAX_AGE_SECONDS (the cookie's maxAge is advisory only —
// the browser can ignore it, so the token itself must carry the deadline).

export const SESSION_COOKIE = "he_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

// Bump to invalidate every outstanding session without rotating AUTH_SECRET.
const SESSION_VERSION = "v1";

const encoder = new TextEncoder();

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

function toBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return toBase64Url(signature);
}

/** Constant-time string comparison to avoid timing leaks. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/** Value to store in the session cookie once the passcode is verified. */
export async function signSession(now: Date = new Date()): Promise<string> {
  const payload = `${SESSION_VERSION}.${Math.floor(now.getTime() / 1000)}`;
  return `${payload}.${await hmac(payload)}`;
}

/** True if the cookie value is a valid, untampered, unexpired session token. */
export async function verifySession(
  token: string | undefined,
  now: Date = new Date(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [version, issuedAtRaw, signature] = parts;

  const expected = await hmac(`${version}.${issuedAtRaw}`);
  if (!constantTimeEqual(signature, expected)) return false;

  if (version !== SESSION_VERSION) return false;
  const issuedAt = Number(issuedAtRaw);
  if (!Number.isSafeInteger(issuedAt)) return false;

  const ageSeconds = Math.floor(now.getTime() / 1000) - issuedAt;
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}
