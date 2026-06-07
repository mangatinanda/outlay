# Plan — Per-Household Currency Switcher (default INR)

**Date:** 2026-06-07
**Status:** Approved design — ready to implement
**Type:** Feature

---

## 1. Goal

Let a household choose its display currency from **Settings**, persist it on
`households.currency`, and apply it to **every** money display across the app as
symbol/number formatting only (**no FX conversion**). The app **defaults to INR (₹)**
with correct Indian digit grouping.

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Behavior on switch | **Reformat only** — amounts are unchanged numbers; only symbol + grouping change. No exchange rates. |
| Storage | **Per household**, on the existing `households.currency` column, via a Server Action. |
| Distribution | **React Context** (`CurrencyProvider`) set once in the `(app)` layout. |
| Default | **INR (₹)**, formatted with the `en-IN` locale. |
| Switcher location | **Settings** page. |

## 3. Why these choices

- The data model already has a household tenant (`households` + `household_id` on members,
  categories, expenses). Currency is a household-level setting → `households.currency`.
- Currency is app-global display state → Context avoids prop-drilling through every page and
  component and keeps call sites uniform (`formatCurrency(amount)` shape is preserved).
- `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })` →
  `₹1,50,000.00` (correct lakh/crore grouping), vs `en-US` → `₹150,000.00`.

## 4. Architecture

```
households.currency (DB)
        │  read per request (force-dynamic)
        ▼
(app)/layout.tsx  ──►  <CurrencyProvider currency=…>
                              │  context
        ┌─────────────────────┼─────────────────────────┐
        ▼                     ▼                          ▼
 useFormatCurrency()   useFormatCurrency()        Settings switcher
 (client money comps)  (server comps → client)    └► updateHouseholdCurrency()
                                                       └► UPDATE + revalidatePath
```

## 5. File-by-File Changes

### New files
| File | Purpose |
|---|---|
| `src/components/providers/currency-provider.tsx` | `"use client"` — `CurrencyProvider`, `useCurrency()`, `useFormatCurrency()` (returns `(amount: number) => string` bound to the household currency + locale). |
| `src/lib/actions/settings-actions.ts` | `"use server"` — `updateHouseholdCurrency(currency: string)`: Zod-validate against `CURRENCIES`, `UPDATE households.currency`, `revalidatePath` money routes. |
| `src/components/settings/currency-switcher.tsx` | `"use client"` — shadcn `Select` over `CURRENCIES`, calls the action on change, toasts result. |
| `src/lib/validators/settings-schema.ts` | Zod enum of valid currency codes (derived from `CURRENCIES`). |

### Modified files
| File | Change |
|---|---|
| `src/components/shared/currency-display.tsx` | `formatCurrency(amount, currency = "INR")` becomes locale-aware via a small `CURRENCY_LOCALE` map (`INR → en-IN`, default `en-US`). Keep `formatCurrency` exported (used by the hook). |
| `src/app/(app)/layout.tsx` | Make `async`; fetch `getDefaultHousehold()`; wrap children in `<CurrencyProvider currency={household?.currency ?? "INR"}>`. Keep `export const dynamic = "force-dynamic"`. |
| `src/app/(app)/settings/page.tsx` | Make `async`; read current currency; replace hardcoded "Currency: USD" with `<CurrencySwitcher current={currency} />`. |
| `src/components/dashboard/summary-cards.tsx` | Add `"use client"`; use `useFormatCurrency()`. |
| `src/components/dashboard/recent-expenses.tsx` | Add `"use client"`; use `useFormatCurrency()`. |
| `src/components/dashboard/category-pie-chart.tsx` | Use `useFormatCurrency()` (already client). |
| `src/components/expenses/expense-list.tsx` | Use `useFormatCurrency()` (already client). |
| `src/components/members/member-manager.tsx` | Use `useFormatCurrency()` (already client). |
| `src/lib/db/schema.ts` | `currency` column default `"USD"` → `"INR"`. |
| `src/lib/db/seed.ts` | Seed household `currency: "INR"`. |

> The expense-form amount input has **no** hardcoded `$` prefix (verified), so it needs no change.

## 6. Default → INR migration

Pre-deploy (no production DB yet), so keep migration history clean:
1. Update `schema.ts` default + `seed.ts` to INR.
2. Regenerate the Drizzle migration: delete `drizzle/`, `pnpm db:generate` (single migration with INR default baked in).
3. Re-init the local DB: `rm -f data/expense.db*` then `pnpm db:init` (re-seeds sample data with an INR household).

Production (fresh Turso) will start on INR from the first migrate+seed.

## 7. Implementation Steps (each with a verification gate)

1. **Formatter** — make `formatCurrency` locale-aware + default INR.
   → verify: `tsc` clean; unit sanity (`formatCurrency(150000,"INR") === "₹1,50,000.00"`).
2. **CurrencyProvider** — add provider + hooks.
   → verify: `tsc` clean.
3. **Wire provider** — `(app)/layout.tsx` async + provider.
   → verify: build clean; pages still render.
4. **Migrate money components** to `useFormatCurrency()` (incl. 2 server→client).
   → verify: `tsc` + lint clean; dashboard/expenses/members render.
5. **Switcher** — action + validator + `currency-switcher.tsx` + Settings page.
   → verify: switching currency in Settings updates the DB and reformats all amounts.
6. **Default INR** — schema/seed + regenerate migration + re-init local DB.
   → verify: fresh `db:init` yields an INR household; dashboard shows ₹ with Indian grouping.
7. **Full verification** — `tsc` + lint + `build` + runtime smoke (gate, all money views, switcher round-trip).

## 8. Acceptance Criteria

- Settings has a working currency dropdown; selecting INR/USD/EUR/… persists to
  `households.currency` and immediately reformats all amounts app-wide.
- Default (fresh DB) currency is **INR**, shown as `₹` with `en-IN` grouping (`₹1,50,000.00`).
- No exchange-rate conversion — stored amounts are unchanged.
- `tsc`, `lint`, `build` all clean; gate and PWA behavior unchanged.

## 9. Out of Scope

- FX/exchange-rate conversion of stored amounts.
- Per-user or per-device currency.
- Per-expense currencies / multi-currency within one household.
- Multi-household management (currency remains per the single default household).
