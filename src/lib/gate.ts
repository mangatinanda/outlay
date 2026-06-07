// Shared access-gate helpers. Uses only the Web Crypto API so the same code
// runs in Edge middleware and in Node Server Actions. No JWT library needed:
// the session cookie is a constant payload signed with HMAC-SHA256, which an
// attacker cannot forge without AUTH_SECRET.

export const SESSION_COOKIE = "he_session";

const SESSION_PAYLOAD = "authed";
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
export async function signSession(): Promise<string> {
  return hmac(SESSION_PAYLOAD);
}

/** True if the cookie value is a valid, untampered session token. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await signSession();
  return constantTimeEqual(token, expected);
}
