# Settle-up balances + household activity log — design

- **Date:** 2026-06-22
- **Status:** Approved (brainstorm) — pending implementation plan
- **Author:** Nanda + Claude

## Goal

Add two related capabilities to Outlay, both scoped to the active household:

1. **Settle up** — Splitwise-style "who owes whom": net per-member balances, the
   minimal set of payments to clear them, and recorded settlements that adjust
   the balances.
2. **Activity log** — an append-only, household-wide audit feed of everything
   that happened (expenses, settlements, members, categories, household, import),
   showing who did what and when.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Split model | **Equal split of everything** among opted-in members. No per-expense split is stored. |
| Participants | **Per-member toggle** (`include_in_settle_up`, default on). The split runs only over members with the toggle on. |
| Settle-up behavior | **Net balances + recorded settlements + minimal-payment suggestions** (full Splitwise behavior). |
| Activity log | **Full audit feed** of all household mutations (dedicated append-only table). |
| Architecture | **Approach 1 — compute balances on read; append-only `settlements` + `activity` tables.** No materialized balances; settlements are NOT modeled as expenses. |

### Consequence accepted: the toggle is retroactive

Because no per-expense split is stored, the **current** opted-in set is applied to
the **entire history**. Toggling a member in/out re-splits all past expenses and
shifts everyone's balance. This is intended for a family household (the toggle
reflects "who shares costs", not a historical record). Freezing per-expense
splits is the deferred "per-expense custom splits" model (out of scope).

## Data model

One new column + two new append-only tables. One Drizzle migration. All money is
integer **minor units** (scale 100, see `lib/money.ts`); ids are cuid2; dates are
ISO `YYYY-MM-DD`; timestamps use `mode:"timestamp"`. Additive only — no changes to
`expenses` or existing queries.

### A. `household_members.include_in_settle_up` (new column)

```
include_in_settle_up  integer (boolean)  NOT NULL  DEFAULT true
```

Default `true` so existing members participate immediately (no backfill).

### B. `settlements` (new table) — a recorded payback (A pays B)

```
id             text     PK (cuid2)
household_id   text     NOT NULL → households.id
from_member_id text     NOT NULL → household_members.id   (payer / who owed)
to_member_id   text     NOT NULL → household_members.id   (receiver / who was owed)
amount_minor   integer  NOT NULL                          (minor units)
date           text     NOT NULL                          (ISO YYYY-MM-DD)
note           text                                       (optional)
created_at     integer (timestamp) NOT NULL
```

Index: `(household_id, date)`. Kept separate from `expenses` so settlements never
appear in spending charts/reports.

### C. `activity` (new table) — append-only household audit feed

```
id             text     PK (cuid2)
household_id   text     NOT NULL → households.id
actor_user_id  text     → users.id (nullable; null = superadmin / "Admin")
actor_label    text     NOT NULL    (denormalized actor name at time of action)
action         text     NOT NULL    (see action vocabulary below)
summary        text     NOT NULL    (rendered line, e.g. 'added "Groceries ₹1,000"')
metadata       text                 (optional JSON: ids/amounts for future linking)
created_at     integer (timestamp) NOT NULL
```

Index: `(household_id, created_at)` for the reverse-chronological feed.

**Why denormalize `actor_label` + `summary`:** an audit log must read correctly
after the referenced expense/member is edited or deleted, and a rendered line
keeps the feed render cheap (no joins, no broken references). `metadata` is
optional headroom for making entries clickable later.

**`action` vocabulary:** `expense.create` | `expense.update` | `expense.delete` |
`expense.import` | `settlement.create` | `settlement.delete` | `member.create` |
`member.update` | `member.delete` | `category.create` | `category.update` |
`category.delete` | `household.create` | `household.rename` | `household.delete`.

## Balance math

Let **P** = members of the active household with `include_in_settle_up = true`,
and **n = |P|**. The settle-up universe is **only expenses paid by a participant**
(an excluded member's expenses stay in spending charts but out of the owe/owed
math). All computation is in **integer minor units** so balances sum to exactly
zero (no float drift); convert to major units only at display.

```
T          = Σ amount_minor of expenses where payer ∈ P          (settleable total)
shareBase  = floor(T / n)
remainder  = T − shareBase·n                                     (0 … n−1)
share(p)   = shareBase, +1 minor unit for the first `remainder` members
             (deterministic order, e.g. by member id)            (Σ share = T exactly)
paid(p)    = Σ amount_minor of expenses where payer = p
out(p)     = Σ amount_minor of settlements where from_member_id = p
in(p)      = Σ amount_minor of settlements where to_member_id = p

net(p)     = paid(p) − share(p) + out(p) − in(p)
```

- `net > 0` → **owed**; `net < 0` → **owes**; `0` → settled.
- The remainder distribution guarantees `Σ net(p) = 0`.

**Plain English:** add up what the participants paid (the pot), split it evenly by
the number of participants (each person's fair share), then for each person
compare what they paid to their share — paid more ⇒ owed, paid less ⇒ owes.
Settlements move money between people, nudging balances toward zero.

**Suggested settlements (debt simplification):** split members into creditors
(`net>0`) and debtors (`net<0`); greedily match the largest debtor to the largest
creditor, transfer `min(|debtor|, creditor)`, drop whoever reaches zero, repeat.
Produces ≤ n−1 transfers. Pure, unit-tested function.

**Edge cases:** `n ≤ 1` → nothing to settle (empty state); all nets zero → "All
settled up"; excluded or zero-activity members don't appear in balances.

**Currency:** single household ⇒ single currency; format with the active
household's currency via `useFormatCurrency` (same as the dashboard).

## Settle-up flow

**Page `/settle-up`** (own sidebar + mobile-nav entry; household-scoped; renders
`<NoHousehold>` when there is no active household). Three blocks:

1. **Balances** — one row per participant: avatar, name, net colored owed (+,
   green) / owes (−, destructive) / settled. Non-participants omitted.
2. **Suggested payments** — the minimal transfer list; each row (e.g. `Siva →
   Nanda ₹1,200`) has a **Settle up** button opening a dialog prefilled with
   from/to/amount (date = today, optional note).
3. **Settlement history** — recorded settlements (from → to, amount, date, note)
   with delete. All nets zero → "All settled up 🎉".

**Server actions** (`lib/actions/settlement-actions.ts`, `safeAction`,
household-scoped, rate-limited via the existing `rateLimit` layer):

- `createSettlement(formData)` — Zod validation: `from ≠ to`, both `from`/`to`
  are participants in the active household, `amount > 0` & ≤ 2 decimals → insert
  `settlements` row → `logActivity("settlement.create", …)` → `revalidatePath`.
- `deleteSettlement(id)` — household-scoped delete → `logActivity` → revalidate.

**Queries** (`lib/queries/settle-up-queries.ts`):

- `getSettleUp(householdId)` → `{ balances, suggestions, settledUp }`.
- `getSettlements(householdId)` → settlement history with member names joined.

**Member toggle:** add an "Include in settle-up" **Switch** to the add/edit member
dialog (and a small indicator on the member card); `createMember` /
`updateMember` persist `include_in_settle_up` (default true). Extend the existing
delete-member guard so a member referenced by any settlement (`from`/`to`) cannot
be deleted (mirrors today's "member has expenses" guard).

## Activity logging

**Helper `logActivity({ householdId, action, summary, metadata? })`**
(`lib/activity.ts`): resolves the actor from `getCurrentActor()` — for a user,
`actor_user_id = userId` and `actor_label` = the user's **household member name**
(fallback `users.name`); for superadmin, `actor_label = "Admin"` — then inserts
one `activity` row.

- **Best-effort:** wrapped so a logging failure is logged (`console.error`) but
  never fails the user's actual mutation. An audit feed missing a line is
  acceptable; a blocked save is not.
- Called **after** the successful mutation, before `revalidate`.

**Instrumented actions:** `createExpense` / `updateExpense` / `deleteExpense`;
`createCategory` / `updateCategory` / `deleteCategory`; `createMember` /
`updateMember` / `deleteMember`; `createHousehold` / `renameHousehold` /
`deleteHousehold`; `inviteToHousehold`; `importExpenses` (one `imported N
expenses` row); `createSettlement` / `deleteSettlement`. Each action builds its
own human summary, e.g. `added "Groceries ₹1,000"`, `edited "Fuel" ₹500→₹600`,
`settled ₹1,200 to Nanda`, `added member "Amma"`.

**Feed page `/activity`** (own sidebar + mobile-nav entry; household-scoped;
`<NoHousehold>` fallback) → `getActivity(householdId)` returns rows newest-first.
UI groups by **Today / Yesterday / date** with actor + summary + relative time.
Loads the latest 50 with **"Show more"** (cursor on `created_at`). Rows are tiny,
so all are kept (the existing cleanup cron may prune very old entries later — not
MVP).

## Navigation

- **Sidebar** (`components/layout/sidebar.tsx`): add **Settle up** (`HandCoins`)
  and **Activity** (`Activity`).
- **Mobile nav** (`components/layout/mobile-nav.tsx`): slots are limited; surface
  **Settle up** in the bottom nav and reach **Activity** from the header/overflow
  (final placement decided in the plan).

## Testing

Matches existing Vitest patterns (in-memory libSQL via `vi.hoisted`; mocked
`next/headers` and `@/lib/auth/actor`).

- **Pure unit (highest value):** balance math (remainder distribution sums to
  exactly zero; participant filter; excluded-payer exclusion) and debt
  simplification (varied net spreads → transfers sum correctly, ≤ n−1, all land
  at zero).
- **Integration:** `createSettlement` (rejects `from=to` / non-participants / bad
  amount; inserts; appends activity), `deleteSettlement` (household-scoped),
  `getSettleUp` end-to-end from seeded expenses + settlements + toggles,
  `getSettlements`; `updateMember` persists the toggle; delete-member blocked when
  referenced by a settlement; "action appends the right activity row" checks
  (e.g. `createExpense` → `added …`).

## Migration & rollout

- **One Drizzle migration** (`pnpm db:generate`): add `include_in_settle_up`
  (default true) to `household_members`; create `settlements` and `activity`.
- **Additive + backward-compatible** (like `0005`): old code ignores the new
  column/tables. **No backfill** — default covers existing members, and balances +
  the already-imported history appear immediately.
- **Deploy:** established flow — push to `main` → Vercel; run `pnpm db:migrate`
  against prod Turso (creds are Sensitive in Vercel, so run with Turso CLI creds).
- Update `CLAUDE.md` "Tables:" list to include `settlements`, `activity`.

## Future extension: per-expense custom splits (not MVP)

The MVP is deliberately a stepping stone to per-expense custom splits. Adding
them later is **additive and non-breaking**:

- **New table `expense_splits`** (`id`, `expense_id → expenses.id`,
  `member_id → household_members.id`, `weight` or `share_minor`). An expense's
  split is the set of its rows.
- **Equal split becomes the default, not a separate model:** an expense with
  **no** `expense_splits` rows keeps today's behavior — equal among the current
  opted-in participants. Only expenses with explicit rows use custom shares ⇒
  **no backfill**; all existing/imported expenses stay equal-split automatically.
- **Localized math change:** only `share(p)` changes — from the global `T/n` to
  "sum over expenses of p's share, where an expense with no split rows
  contributes its equal share." The `net = paid − share + out − in` formula, the
  participant toggle, settlements, suggestions, and the activity feed are all
  **unchanged**.
- **UI:** add an optional "Split" control (equal / exact amounts / shares) to the
  add/edit expense form; default equal.
- **Enabled by Approach 1:** because balances are computed on read (never
  materialized), swapping the share rule needs no migration of stored balances.

This is why we chose compute-on-read + "no split = equal" for the MVP: the
"equal now, overridable later" path stays open at low cost.

## Out of scope (YAGNI)

- Per-expense custom splits — **deferred, not abandoned**; see *Future extension*
  above for the additive, non-breaking path.
- Multi-currency settle-up (single household ⇒ single currency).
- Owed-balance notifications / reminders.
- **Editing** settlements (create + delete only in MVP).
- Activity pruning / retention policy.
