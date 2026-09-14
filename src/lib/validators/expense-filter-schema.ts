import { z } from "zod/v4";

/**
 * Expense-list filters live in the URL, so they survive a refresh, work with
 * the back button, and a filtered view can be shared as a link. Everything
 * here is defensive: a hand-edited query string must degrade to "no filter",
 * never to an error page.
 */
export interface ExpenseFilters {
  from?: string;
  to?: string;
  category?: string;
  member?: string;
  q?: string;
}

/** Longest search we send to the query (also what the input allows). */
export const SEARCH_MAX_LENGTH = 100;

const isoDate = z.iso.date();
const id = z.string().min(1).max(64);

/** Next.js gives `string | string[] | undefined`; take the first value. */
function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

function parseDate(value: string | string[] | undefined): string | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  return isoDate.safeParse(raw).success ? raw : undefined;
}

function parseId(value: string | string[] | undefined): string | undefined {
  const raw = first(value);
  if (!raw) return undefined;
  return id.safeParse(raw).success ? raw : undefined;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Read filters out of a query string, dropping anything malformed. */
export function parseExpenseFilters(params: RawSearchParams): ExpenseFilters {
  const filters: ExpenseFilters = {};

  let from = parseDate(params.from);
  let to = parseDate(params.to);
  // A reversed range is a user slip, not an error — swap it so it still works.
  if (from && to && from > to) [from, to] = [to, from];
  if (from) filters.from = from;
  if (to) filters.to = to;

  const category = parseId(params.category);
  if (category) filters.category = category;

  const member = parseId(params.member);
  if (member) filters.member = member;

  const q = first(params.q)?.trim().slice(0, SEARCH_MAX_LENGTH);
  if (q) filters.q = q;

  return filters;
}

/** Build a query string from filters, omitting empty values. */
export function filtersToSearchParams(
  filters: ExpenseFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.category) params.set("category", filters.category);
  if (filters.member) params.set("member", filters.member);
  if (filters.q) params.set("q", filters.q);
  return params;
}

/**
 * How many filters the user would think are on. A date range counts once,
 * however many of its two ends are set, because the UI shows it as one chip.
 */
export function countActiveFilters(filters: ExpenseFilters): number {
  let n = 0;
  if (filters.from || filters.to) n++;
  if (filters.category) n++;
  if (filters.member) n++;
  if (filters.q) n++;
  return n;
}
