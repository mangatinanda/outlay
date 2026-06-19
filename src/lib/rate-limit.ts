import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { parseLimit } from "@/lib/limits";

/**
 * Per-action throughput caps. The per-household *total* is bounded elsewhere
 * (LIMITS.maxExpensesPerHousehold); these bound the *rate*, so a scripted
 * account can't burn the free-tier write/row quotas in a burst. Overridable by
 * env; set RATE_LIMIT_DISABLED=1 to switch the whole layer off.
 */
export const RATE_LIMITS = {
  /** Expense writes per household per minute. */
  expenseWritesPerMinute: parseLimit(env.RATE_LIMIT_EXPENSES_PER_MIN, 60),
  /** Household creations per user per hour. */
  householdCreatesPerHour: parseLimit(env.RATE_LIMIT_HOUSEHOLDS_PER_HOUR, 10),
  /** Bulk imports per household per hour. */
  importsPerHour: parseLimit(env.RATE_LIMIT_IMPORTS_PER_HOUR, 5),
};

export const RATE_LIMIT_DISABLED =
  env.RATE_LIMIT_DISABLED === "1" || env.RATE_LIMIT_DISABLED === "true";

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
  /** Injectable clock (ms epoch) so the fixed window is testable. */
  now?: number;
}

export interface RateLimitResult {
  limited: boolean;
  count: number;
}

/**
 * Atomic fixed-window counter backed by the `rate_limits` table (a single
 * upsert, so it's correct under concurrency and shared across instances).
 *
 * Fails OPEN: if the store errors, the request is allowed — a limiter glitch
 * must never lock real users out. No-ops (allows) when RATE_LIMIT_DISABLED.
 */
export async function rateLimit(
  key: string,
  { limit, windowSec, now = Date.now() }: RateLimitOptions,
): Promise<RateLimitResult> {
  if (RATE_LIMIT_DISABLED) return { limited: false, count: 0 };

  const nowSec = Math.floor(now / 1000);
  const windowStart = nowSec - (nowSec % windowSec); // align to the window grid

  try {
    const [row] = await db
      .insert(rateLimits)
      .values({ key, count: 1, windowStart })
      .onConflictDoUpdate({
        target: rateLimits.key,
        // Within the same window, increment; in a new window, reset to 1. The
        // CASE reads the pre-update row, so it compares the OLD window_start.
        set: {
          count: sql`CASE WHEN ${rateLimits.windowStart} = ${windowStart} THEN ${rateLimits.count} + 1 ELSE 1 END`,
          windowStart: sql`${windowStart}`,
        },
      })
      .returning({ count: rateLimits.count });
    const count = row?.count ?? 1;
    return { limited: count > limit, count };
  } catch (err) {
    // Fail open, but LOG — otherwise a permanent misconfiguration (e.g. the
    // rate_limits migration not applied to prod) silently disables every
    // throttle and looks identical to healthy operation.
    console.error("[rateLimit] store error — failing open:", err);
    return { limited: false, count: 0 };
  }
}

/** Standard user-facing message when a limiter trips. */
export const RATE_LIMITED_MESSAGE =
  "You're doing that too often. Please wait a moment and try again.";
