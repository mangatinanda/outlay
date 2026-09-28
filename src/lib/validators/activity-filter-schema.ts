/** Longest actor label accepted from the URL (labels are member/user names). */
export const ACTOR_MAX_LENGTH = 100;

/**
 * `?actor=` on /activity, read defensively: a hand-edited query string must
 * degrade to "no filter", never to an error page. Trimmed, capped, empty → off.
 */
export function parseActorFilter(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim().slice(0, ACTOR_MAX_LENGTH);
  return trimmed || undefined;
}
