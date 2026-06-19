import { parseAllowList } from "@/lib/allow-list";
import { env } from "@/lib/env";

/**
 * Per-deployment resource caps that bound how much one principal — or the app
 * as a whole — can write to the (free-tier) database. They matter most under
 * open sign-up (`HOUSEHOLD_ALLOWED_EMAILS=*`), where anyone with a Google
 * account can self-register: without caps a single scripted account, or sheer
 * sign-up sprawl, could exhaust Turso's row-write / storage quotas.
 *
 * Each is overridable by an env var; the defaults are deliberately generous.
 */
export const DEFAULT_LIMITS = {
  /** Total accounts (`users` rows). New self-service sign-ups stop at this. */
  maxUsers: 1000,
  /** Households one user may create / belong to. */
  maxHouseholdsPerUser: 10,
  /** Expenses one household may hold. */
  maxExpensesPerHousehold: 50_000,
} as const;

/** Parse a positive-integer env override, falling back to the default. */
export function parseLimit(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export const LIMITS = {
  maxUsers: parseLimit(env.MAX_USERS, DEFAULT_LIMITS.maxUsers),
  maxHouseholdsPerUser: parseLimit(
    env.MAX_HOUSEHOLDS_PER_USER,
    DEFAULT_LIMITS.maxHouseholdsPerUser,
  ),
  maxExpensesPerHousehold: parseLimit(
    env.MAX_EXPENSES_PER_HOUSEHOLD,
    DEFAULT_LIMITS.maxExpensesPerHousehold,
  ),
};

/**
 * True when the allow-list opts into open sign-up — a literal "*" entry means
 * any Google account may register (see `isEmailAllowed`). Used to decide when
 * the global `maxUsers` cap applies.
 */
export function isOpenSignup(rawAllowList: string | undefined): boolean {
  return parseAllowList(rawAllowList).includes("*");
}
