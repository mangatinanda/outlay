/** Parse the comma-separated HOUSEHOLD_ALLOWED_EMAILS env value. */
export function parseAllowList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decide whether a Google account may sign in.
 *
 * With no allow-list configured, development allows everyone (local
 * convenience) but production FAILS CLOSED — otherwise a forgotten env var
 * would silently open the shared households to any Google account.
 */
export function isEmailAllowed(
  email: string | null | undefined,
  rawAllowList: string | undefined,
  production: boolean,
): boolean {
  const allowed = parseAllowList(rawAllowList);
  if (allowed.length === 0) return !production;
  if (!email) return false;
  return allowed.includes(email.trim().toLowerCase());
}
