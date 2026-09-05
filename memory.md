# Outlay — Project Memory

> Working memory for this repo. Read this at the start of a session for context;
> append a dated entry after completing significant work. See the `repo-memory` skill.

## Snapshot

- **App:** Outlay — a collaborative household expense‑tracking **PWA** (formerly "HomeExpense").
- **Repo:** `github.com/mangatinanda/outlay` (renamed from `home-expense`). Local: `/Users/nanda/vibe-code/outlay`.
- **Package manager:** pnpm. **Branch:** `main`.
- **Dev:** `pnpm dev` → http://localhost:3000. Local passcode: `home123`.

## Stack

Next.js 16.2.7 (App Router, React 19.2, Server Components + Server Actions, Turbopack) ·
TypeScript 6 · Tailwind v4 + shadcn/ui on **Base UI 1.5** · **Turso/libSQL** (`@libsql/client`)
+ Drizzle ORM (`sqlite-core`) · Zod 4 · Recharts 3 · `@serwist/turbopack` PWA ·
**next-auth v5** (`5.0.0-beta.31`, Google — Model A) · date-fns 4 · cuid2.
**Biome 2.5** (replaced ESLint; CSS lint/format off, `useSortedClasses` enforced) + a PostToolUse
auto-format hook · **Playwright** e2e (Pixel-7; seeded `data/e2e.db` via the webServer command) ·
**motion** (`motion/react`) animation primitives in `src/components/motion/` · typed env in
`src/lib/env.ts` (zod; build-phase relaxed). UI is the **Fresh Ledger** design system
(`.claude/skills/design-system` + `.claude/rules/ui.md`): Plus Jakarta Sans display + Geist body,
warm OKLCH light+dark tokens, `shadow-card`/`shadow-float`/`shadow-pop`, indigo accent.
`packageManager`/`engines` pinned — `pnpm/action-setup` must NOT also set `version:` (errors on the
double‑spec; CI reads pnpm from `packageManager`).

## Architecture & conventions

- **Reads** → `src/lib/queries/*` in Server Components. **Writes** → `src/lib/actions/*` Server
  Actions (Zod‑validate → Drizzle → `revalidatePath`). No REST API except `/api/auth/*` (Auth.js)
  and the Serwist SW route `/serwist/[path]`.
- **Auth (Model B — per‑user households):** each request resolves to one principal via
  `getCurrentActor()` (`src/lib/auth/actor.ts`): a **superadmin** (valid `he_session` passcode cookie,
  entered at **`/admin`** — bypasses scoping, sees all households) or a scoped **user** (Google/Auth.js
  v5 JWT carrying `session.user.id`). **Passcode‑first** precedence.
  - **Passcode** — Web Crypto HMAC cookie `he_session` (`src/lib/gate.ts`, `AUTH_SECRET`,
    `SESSION_VERSION` now **`v2`**). `proxy.ts` (Node runtime) still grants entry on a Google session
    **OR** a valid passcode; the matcher excludes `/admin` + `/login`. Passcode in `HOUSEHOLD_PASSCODE`.
  - **Google (Auth.js v5)** — `src/auth.ts` (JWT, no adapter): `signIn`→`canSignIn` (allow‑list OR has
    a membership/invite), `jwt`→`upsertUserByEmail`+`claimInvites`+`token.userId`, `session`→
    `session.user.id`. Users persisted in `users` on first sign‑in.
  - **Membership = the boundary:** `src/lib/auth/membership.ts` (`isMember`, `userHouseholds`,
    `assertCanAccessHousehold`). A user sees/mutates only households with a `household_members` row
    carrying their `user_id`. **Invite by email** → `inviteToHousehold` creates a pending row (`email`,
    null `user_id`), claimed on the invitee's next login.
- **Multi‑household ("workspaces"):** the active household is the `he_household` cookie, resolved by
  `getCurrentHousehold()` (`src/lib/queries/household-queries.ts`) **scoped to the actor's memberships**
  (cookie honored only if a member, else their first membership; superadmin: any/first). `listHouseholds`/
  `switchHousehold`/`renameHousehold` likewise scoped (non‑member → `"Household not found"`, no leak).
  All data (members, categories, expenses, currency) is scoped by `household_id`, so switching isolates
  data. Manage via the sidebar switcher + `/households`; a user with zero households still enters the app
  shell and sees a friendly `<NoHousehold>` empty state on each menu (CTA → `/households`) — no forced
  onboarding (the `FirstHousehold` gate was removed 2026‑06‑22).
- **Currency:** per‑household (`households.currency`), **default INR** (en‑IN grouping). `CurrencyProvider`
  + `useFormatCurrency()`; changed via the Settings switcher (`updateHouseholdCurrency`). Reformat‑only,
  no FX conversion.
- **DB:** one libSQL driver for both worlds — `file:./data/expense.db` (dev, gitignored) and
  `libsql://…`+token (prod). Drizzle migrations in `drizzle/`; `pnpm db:migrate` + `pnpm db:seed`
  (no auto‑seed). DB‑backed pages export `dynamic = "force-dynamic"` (via the `(app)` layout) so the
  **build needs no database**.
- **PWA:** `@serwist/turbopack` (NOT `@serwist/next` — that needs webpack). SW served at `/serwist/sw.js`
  via `src/app/serwist/[path]/route.ts`; `/~offline` fallback; `SerwistProvider` in the root layout.
- **Plans** live in `plans/`; design specs in `docs/superpowers/specs/`.

## Work log

### 2026‑09‑05 — PR #2 (in‑app notifications) reviewed + hardened before merge

`/code-review 2 high` (10 finder angles, per‑finding verifiers) returned 15 findings on the branch; the
correctness ones were fixed in `ffe1877`, each with a regression test written first (238 unit tests now).
- **FK‑safe invite decline/accept:** `declineInvite` and `acceptInvite`'s duplicate‑row branch deleted a
  `household_members` row that `expenses`/`settlements` may reference (admins can pick a pending invitee as
  payer; **libSQL enforces FKs by default — `PRAGMA foreign_keys=1`**), so the DELETE threw and the invite
  was stuck forever. New shared guard `memberLedgerReference()` (`src/lib/queries/member-ledger.ts`, also
  reused by `deleteMember`) refuses with a clear message. Decline now writes an activity row; the
  duplicate‑row path revalidates the layout.
- **Cleanup cron:** `cleanupAbandonedAccounts` now deletes the user's `notifications` inside the atomic
  batch (the new `notifications.user_id` FK would have 500'd the nightly job for any abandoned user who
  ever got one).
- **Honest results:** `createExpense`, `inviteToHousehold`, `acceptInvite`, `declineInvite` ran unguarded
  lookups *after* their mutation, so a transient failure returned `{error}` for a committed row (retry ⇒
  duplicate expense / "already invited"). Lookups now run before the mutation; only best‑effort
  `notify`/`logActivity` follow it.
- **Prune exempts `invite.received`** (a chatty household could silently delete a pending invite).
- **`formatMinor` → shared `formatCurrency()`** (was hard‑coded `en-IN`: USD showed lakh grouping, JPY
  showed decimals). `notificationText` gained a `default` branch (unknown type no longer crashes the header).
- **Bell:** handles `loadNotifications`' `{error}` (no stuck "Loading…", no premature mark‑all‑read, badge
  restored), skips poll ticks while open, adopts a fresh server `initialCount` via effect. Relative time in
  `NotificationItem` gets `suppressHydrationWarning`.
- **Service worker:** `sw.ts` prepends a `NetworkOnly` rule for `/api/notifications/` — Serwist's
  `defaultCache` applies NetworkFirst (10s timeout → cache) to every same‑origin `/api/` GET, which could
  resurrect a stale or another user's unread count.
- **Docs corrected** (FEATURES.md + the 07‑07 entry above): no "mark all read" control exists (the bell
  auto‑marks on open); `null`/`0` threshold = OFF, fires at‑or‑above; lists are fixed 10/50, not paginated;
  invite outcomes go to all other admins; queries scope by `user_id` only.
- **Deferred (design/UX, not blockers):** (1) the owner who unlocked `/admin` is resolved as superadmin on
  every request (passcode cookie wins) and therefore sees no bell while `notify()` still writes rows to their
  user id — needs a "lock admin" action or a superadmin actor that carries `userId`; (2) React 19 resets the
  threshold form's uncontrolled input on an `{error}` result; (3) Accept/Decline/View‑all are non‑`menuitem`
  children inside the `role="menu"` popup; (4) `readAt` reaches the client but isn't used for unread
  styling; (5) pre‑existing: `cleanup.ts`/`deleteHousehold` don't delete `activity`/`settlements` rows
  before the household row (same FK class); (6) `src/lib/db/index.test.ts` times out under CPU load
  (dynamic import >5s) and then cascades into its sibling test — pre‑existing flake, not from this branch.

### 2026‑07‑07 — In-app notifications (branch `feat/in-app-notifications`)

Implemented full in‑app notifications end‑to‑end via subagent‑driven TDD (12 tasks, all green).
Spec: `docs/superpowers/specs/2026-07-07-in-app-notifications-design.md`; plan:
`docs/superpowers/plans/2026-07-07-in-app-notifications.md`.

- **Schema & migration** (`drizzle/0007_*.sql`): new `notifications` table (`household_id`,
  `user_id`, `type`, `payload`, `read_at`, `created_at`) plus `households.notify_expense_over_minor`
  (nullable integer minor‑units threshold — `null`/`0` = "expense notifications OFF" per household).
- **`notify()` fan‑out helper** (`src/lib/notifications.ts` or similar) — best‑effort (never throws,
  mirrors `logActivity`'s pattern), fans a single event out to every relevant household member's
  `user_id`, and **prunes each recipient to their most‑recent 100** notifications on every write so
  the table can't grow unbounded.
- **Emitters wired into existing actions:** `invite.received` (on `inviteToHousehold`, only to
  already‑registered users — a pending invite with no `user_id` yet has nothing to notify),
  `invite.accepted` / `invite.declined` (to the household's other admins), `settlement.recorded` (on
  `createSettlement`, to the other party), `expense.large` (on `createExpense`, fan‑out to household
  members when the expense's `amountMinor` exceeds the household's `notifyExpenseOverMinor`
  threshold — `null`/`0` = OFF, fires at‑or‑above).
- **In‑app invite accept/decline without re‑login:** `acceptInvite`/`declineInvite`
  (`src/lib/actions/notification-actions.ts`) let a signed‑in user claim a pending
  `household_members` invite row directly from the notification UI; the existing login‑time
  `claimInvites` (Auth.js `jwt` callback) remains the fallback for invites accepted before the user
  ever signs in. Also: `markAllNotificationsRead`, `loadNotifications` (newest 10 for the dropdown).
- **Reads:** notification queries (unread count + list, newest‑first) scoped to
  `user_id` (cross‑household by design) — **superadmin gets nothing** (no `userId` on that actor, by design:
  notifications are a per‑user‑household concept, not a superadmin/god‑mode one).
  `GET /api/notifications/count` powers a 60s client poll.
- **UI:** `NotificationItem` (shared render for both the dropdown and the full page, with inline
  Accept/Decline buttons for invite‑type rows), `NotificationBell` in the header (badge shows
  unread count, dropdown lists the newest 10 and auto‑marks all read on open), `/notifications` page (newest 50).
  Bell renders `null`/is absent entirely for the superadmin actor.
- **Threshold setting:** Settings UI (admin‑only) to set/clear the per‑household
  `notifyExpenseOverMinor`; a small `memberRole` helper resolves whether the current actor is an
  admin of the active household to gate the control.
- **Two drive‑by fixes caught during implementation:** (1) `userHouseholds()`
  (`src/lib/auth/membership.ts:32`) was not selecting `notifyExpenseOverMinor` — the expense emitter
  needs it on the household row it already fetches, so it's now included in that query's column
  list; (2) `createExpense` (`src/lib/actions/expense-actions.ts:119`) treats a `null` threshold as
  `0` (`household.notifyExpenseOverMinor ?? 0`) so "no threshold set" means expense notifications OFF (only notify if `threshold > 0`).
- **Web Push is explicitly v2**, hooked at the `notify()` call site (not built — in‑app only for v1).
- **e2e guard** (`e2e/dashboard.spec.ts`): the existing passcode/superadmin dashboard smoke test now
  asserts `getByRole("button", { name: /^Notifications/ })` has count 0 — locks in "superadmin sees
  no bell" as a regression‑proof contract.
- **Out of scope (deliberately not built):** Web Push, digests, per‑user notification preferences,
  `invited_by` attribution, expense‑update/import emitters, a sidebar nav link to `/notifications`
  (reached via the bell only).
- **Verification:** Biome lint ✅ (3 pre‑existing warnings only — 2 graphify‑out file‑size, 1
  `noExplicitAny` in `notification-actions.ts` predating this task's e2e/memory work), tsc ✅,
  **227 unit tests** ✅, production build ✅ (routes incl. `/notifications` and
  `/api/notifications/count` present), **`pnpm test:e2e` 4/4 specs green** (dashboard, login,
  add‑expense, switch‑household‑isolation) including the new bell‑absence assertion.

### 2026‑06‑23 — Mobile drawer auto-close + app-level loader (top bar + skeletons)

Two UX fixes (UI/interaction only; no data/query/action logic changed). **Uncommitted** on `main`.

- **Mobile drawer auto-close:** the left-pane drawer is the Base UI `Sheet` in `header.tsx` wrapping
  the shared `<Sidebar inSheet>`; nothing closed it on nav. Now the `Sheet` is **controlled**
  (`open`/`onOpenChange`) and `Sidebar` takes an `onNavigate` callback wired to every nav `Link`
  **and** the `HouseholdSwitcher` (switch + create + manage), so a tap closes it immediately. A
  `usePathname`‑ref effect in the header is the safety net for any future in‑drawer link.
- **App‑level loader (user picked: slim top bar + skeletons, on nav AND saves):**
  - `src/lib/progress.ts` — tiny external store (`navInFlight` ‖ `actionCount`) + `withProgress(fn)`
    (balanced start/end in `finally`, survives throw/`redirect()`). `src/components/feedback/top-progress-bar.tsx`
    — slim indigo bar (token‑only, motion/react, no‑ops under reduced motion) mounted app‑wide in
    `layout.tsx` inside `<Suspense>` (it reads `useSearchParams`). Nav START = capture‑phase internal
    `<a>` click; FINISH = committed route‑key change; 4s safety timeout + a **mount‑time
    `setNavInFlight(false)`** so an errored nav that remounts the tree can’t leave it stuck.
  - **Skeletons:** `page-skeleton.tsx` + per‑route `loading.tsx` for the 4 pages that had **zero**
    loading UI (activity, households, settings, settle‑up). Deliberately NOT a catch‑all `(app)/loading.tsx`
    — that double‑skeletoned against the 4 pages (dashboard/expenses/categories/members) which already
    have in‑page `<Suspense>` skeletons.
  - `globals.css` — added the canonical `prefers-reduced-motion` reset (near‑zero, not removed) so CSS
    `animate-pulse` skeletons (and all CSS anim/transition) honor the OS setting; Base‑UI `data-ending-style`
    closes still fire `transitionend`.
  - **Saves wired through `withProgress` (12 actions):** expense create/update/delete, settlement
    create/delete, category + member CRUD, invite, import, `switchHousehold`, `updateHouseholdCurrency`,
    and **household‑manager** create/rename/delete/switch/accent. Export is pure client‑side blob gen
    (no server wait) — intentionally excluded.
- **⚠️ Biome footgun (cost two real bugs, caught in review):** the PostToolUse Biome auto‑format runs
  **after every edit**. (1) `organizeImports` **strips an import added before its first usage** — so add
  the import in the SAME or a LATER edit than the usage. (2) `useExhaustiveDependencies` **strips a
  dependency‑only effect dep** (a value listed in `[deps]` but not read in the effect body) and renames
  the now‑unused var to `_x` → my pathname/searchParams effects silently became `[]` and never re‑ran
  (top bar hung ~8s every nav; header safety‑net was dead). **Fix: read the value in the effect body**
  (route‑key/last‑path ref comparison) so it stays a real dep.
- **Verification:** tsc / Biome / **194 unit tests** / production build all green. Ran a 3‑dimension
  adversarial multi‑agent review (correctness / design‑a11y / completeness, each finding verified) →
  **7 real findings, 0 dismissed**, all fixed (the two empty‑deps bugs, the household‑manager gap, the
  double‑skeleton, the 8s→4s timeout). Then **live browser verify** (chrome‑devtools, passcode login,
  seeded DB): deterministic opacity probe shows the bar appears at **t+69ms** and clears at **t+802ms**
  (`last:0`, not stuck); mobile drawer auto‑closes on a menu tap; no console errors.
- **Note:** local dev DB (`data/expense.db`) was **stale** — missing `household_members.include_in_settle_up`
  (migration `0006`), so `/expenses` 500’d until `pnpm db:migrate`. Unrelated to this change; flagged here
  because a stale local DB will 500 any members‑querying page.

### 2026‑06‑22 — Settle-up + Activity Log: balances, settlements, audit trail

Implemented the full settle-up feature and an append-only activity audit feed.
Branch: `feat/settle-up-and-activity-log` (10 tasks, all green). Schema migration `0006` + two new tables + UI routes.

- **Schema & migration** (`drizzle/0006_*.sql`): additive (no backfill) — new `settlements` + `activity` tables
  (both `household_id`-scoped), plus `household_members.include_in_settle_up` boolean (default `true`).
- **Balance math** (`src/lib/settle-up/balances.ts`): pure functions `computeShares`, `computeNetBalances`,
  `simplifyDebts`. Integer minor units; equal split over opted-in participants; balances sum to zero; greedy
  debt-simplification produces the suggested payments.
- **Settle-up reads** (`src/lib/queries/settle-up-queries.ts`): `getSettleUp` (balances + suggestions +
  settledUp flag) and `getSettlements` (settlement history).
- **Settlement writes** (`src/lib/actions/settlement-actions.ts`): `createSettlement` and `deleteSettlement`;
  validator `src/lib/validators/settlement-schema.ts`. No "clear all / zero-out" action.
- **Activity** (`src/lib/activity.ts` `logActivity` — best-effort, never throws; query
  `src/lib/queries/activity-queries.ts` `getActivity` newest-first with `before` cursor; action
  `src/lib/actions/activity-actions.ts` `loadMoreActivity` powers "Show more"). Instrumented: expense
  create/update/delete, category create/update/delete, member create/update/delete, household create + rename,
  invite, import, and both settlement actions.
- **Member toggle**: `include_in_settle_up` persisted via the existing `createMember`/`updateMember` (not a
  separate action); exposed as a `Switch` in the member dialog. `deleteMember` now blocks when the member is
  referenced by a settlement. **Known edge (v1 accepted):** toggling a member out after a settlement involving
  them can make displayed balances not sum to zero — the toggle is retroactive by design.
- **Pages**: `/settle-up` (`src/app/(app)/settle-up/page.tsx` + `src/components/settle-up/settle-up-view.tsx`)
  — balances, suggested payments with one-tap "Settle up", record dialog, history with delete. `/activity`
  (`src/app/(app)/activity/page.tsx` + `src/components/activity/activity-feed.tsx`) — day-grouped feed
  (Today/Yesterday/date) with "Show more". No member filter on the feed.
- **Nav**: sidebar gains Settle up + Activity; mobile-nav swaps Categories → Settle up.
- **Deferred:** per-expense custom splits (design spec at
  `docs/superpowers/specs/2026-06-22-settle-up-and-activity-log-design.md`).
- **Verification:** tsc ✅, Biome ✅, 192 unit tests ✅, production build + routes visible ✅.

### 2026‑06‑22 — Drop the forced first‑household onboarding (empty states instead)

A new member no longer hits a full‑screen "Create your first household" wall. Removed the gate in
`src/app/(app)/layout.tsx` (`if (actor.kind === "user" && householdList.length === 0) return <FirstHousehold/>`)
and **deleted** `src/components/onboarding/first-household.tsx`. New members enter the app shell freely and
see a friendly empty state on every menu.

- **New shared component** `src/components/shared/no-household.tsx` (`<NoHousehold>`) — composes the existing
  `EmptyState` + a `Button`‑as‑`Link` to `/households` (where the create form already lives — chosen over an
  inline dialog). Default title "Welcome to Outlay"; each page passes a context‑specific `description`.
- **Pages now render `<NoHousehold>` when `getCurrentHousehold()` is null** (were `<p>No household…</p>` /
  `return null`): dashboard, expenses, categories, members, and the expenses **new/edit/import** sub‑pages.
- **`dashboard` + `expenses` pages made `async`** to **hide** their header "Add Expense"/"Import" actions while
  there's no household (the body's `<NoHousehold>` carries the only CTA). `getCurrentHousehold` is React
  `cache()`d so the extra page‑level await is free (deduped with the Suspense child + the layout).
- **`household-switcher.tsx`:** a zero‑household member now gets a working **"Create household"** `Link` →
  `/households` (visually twins the dropdown trigger) instead of a **disabled** dead control. Header
  (`householdName ?? "Outlay"`) + Sidebar were already null‑safe.
- **Stale comments fixed:** `app-logo.tsx` and `allow-list.ts` no longer reference the deleted onboarding splash.
- **Verification:** tsc + Biome + **167 unit tests** + production build all green. Ran a 3‑dimension adversarial
  multi‑agent review (completeness / correctness / design‑a11y, each finding verified): **1 real finding** — the
  new switcher `Link` lacked a focus‑visible ring (WCAG 2.4.7 regression vs the Base‑UI trigger it replaced) →
  fixed by adding the project's standard `outline-none focus-visible:border-ring focus-visible:ring-3
  focus-visible:ring-ring/50`; 4 findings dismissed as subjective/non‑defects.
- **Then `/code-review` (high, 8 finder angles → verify) caught a real miss:** `/settings` was **not** guarded —
  a zero‑household user saw a "My Home" fallback + an interactive `CurrencySwitcher` that fails with "No household
  found" on use. Fixed: the household card is now swapped for `<NoHousehold>` when `household` is null (the static
  About card stays). Also fixed two minor follow‑ups from that review: switcher touch targets bumped to `min-h-11`
  (44px, per `.claude/rules/ui.md`) on **both** states, and dashboard/expenses header descriptions made conditional
  (no household‑implying copy above the empty state). Everything re‑verified green (tsc/Biome/167 tests/build).
- **Shipped as PR #1** (`feat/no-forced-household` → `main`): https://github.com/mangatinanda/outlay/pull/1 — **not
  merged, not deployed.** Note: the zero‑household *Google* state can't be reproduced in local dev (passcode =
  superadmin always has a household; Google needs real OAuth), so the empty‑state path is verified via gates +
  code review, not a live session.

### 2026‑06‑16 — Model B: user‑owned households + superadmin passcode (branch `feature/model-b-households`)

Fixed the authorization gap the 2026‑06‑16 audit found (any logged‑in user could read/write ANY
household — `getCurrentHousehold`/`listHouseholds`/`switchHousehold` did no membership check and
`household_members.user_id` was dead). Executed the spec+plan under
`docs/superpowers/{specs,plans}/2026-06-16-model-b-user-owned-households*` via subagent‑driven TDD,
15 tasks. **116 unit tests + 4 e2e + tsc/Biome/build all green; final whole-branch review APPROVED.**
Merged to local `main` (fast-forward, feature branch deleted); **NOT yet pushed/deployed.**
- **Schema:** `household_members.email` column + unique indexes `(household_id,user_id)` /
  `(household_id,email)` + `email` index (`drizzle/0003_watery_warbound.sql`).
- **Identity:** `src/lib/auth/{actor,membership,users,callbacks}.ts` — `getCurrentActor()`
  (passcode‑first → superadmin, else Google user), membership guards, `upsertUserByEmail`/
  `claimInvites`/`canSignIn`; `auth.ts` callbacks persist the user + expose `session.user.id`
  (typed via `src/types/next-auth.d.ts`).
- **Scoping:** the three resolvers + `switch/rename/createHousehold` made actor‑aware; ~20 per‑page
  call sites fixed transitively. Existing `scoping.test.ts` runs as superadmin (additive change only).
- **Routes:** `/login` Google‑only; new `/admin` hosts the passcode form; proxy matcher excludes
  `/admin`. `SESSION_VERSION` `v1`→`v2`.
- **Invites/onboarding:** `inviteToHousehold` (admin/superadmin, dedup) + `/members` invite UI +
  access badges; first‑household onboarding for a user with zero households.
- **Migration:** idempotent `pnpm db:migrate:model-b` (`scripts/migrate-model-b-owner.ts`) backfills
  owner `mangatinanda@gmail.com` as admin of existing households.
- **Review catch:** Task 2 `upsertUserByEmail` had an empty‑`.set()` "No values to set" landmine
  (a re‑auth with no name/image) — caught in quality review, fixed + regression test. e2e: all 4 specs
  (incl. `dashboard`/`add-expense`) updated to unlock at `/admin`.

### 2026‑06‑15 (end of day) — Fresh Ledger redesign MERGED to `main` + DEPLOYED to prod

The full UI redesign + repo hardening (spec + plan under `docs/superpowers/{specs,plans}/2026-06-15-…`)
shipped via subagent‑driven execution across M0–M6 (39 commits): **M0** Biome + typed‑env +
Playwright + pins; **M1** tokens/fonts/motion primitives + design‑system skill; **M2** app shell
(sidebar pill, mobile FAB + sliding pill, header greeting); **M3** dashboard (gradient hero w/
count‑up, area chart, donut, friendly empty states); **M4** expenses list + swipe‑to‑delete +
FAB→bottom‑sheet morph; **M5/M6** grids/login restyle + a11y (Lighthouse Accessibility **100** on
all pages). Data/auth behavior unchanged (final review confirmed via whitespace‑ignored diff);
prior‑audit safety props intact. Fast‑forward‑merged to `main`, feature branch deleted.
**Live: https://outlay.mangatinanda.me** — verified in prod: passcode login → redesigned dashboard,
empty states polished, dark mode.
- **CI gotcha fixed (`1c106a2`):** the `packageManager` pin collided with `pnpm/action-setup`'s
  `version: 11` input → both jobs failed at setup. Removed the input; CI now green (ci + e2e).
  Vercel deploys independently of GH CI, so the first prod deploy succeeded before the fix landed.
- Verify cmds now include `pnpm test:e2e` (Playwright). 74 unit tests + 4 e2e specs.

### 2026‑06‑15 (latest) — M5/M6 final verification: isolation e2e + a11y → Lighthouse 100

Closed the redesign (Plan 05 Tasks 9–12) on `redesign/fresh-ledger`. Tasks 1–8
(grid/login/empty‑state restyles) were already committed; this pass added the
data‑isolation e2e and the a11y/Lighthouse sweep.

- **Task 9 — switch‑household isolation e2e** (`e2e/switch-household-isolation.spec.ts`,
  commit `dfa5c9d`). Extended `seed()` in `src/lib/db/seed.ts` with an **e2e‑only**
  two‑household fixture (`seedE2EIsolationFixture`) guarded on `DATABASE_URL`
  containing `e2e.db` (dev/prod single‑household seed untouched): House A = 3
  expenses incl. marker `HOUSEHOLD_A_ONLY_EXPENSE`, House B = 1 → counts differ +
  marker unique to A. Used `amountMinor`/string `date` (plan’s draft said
  `amount`/`Date` — wrong vs real schema). Added `data-testid="expense-row"` to the
  **M4 `ExpenseRow`** root (plan pointed at the old inline `<div>` in
  `expense-list.tsx`, which M4 refactored away). **Test bug found+fixed:** the
  draft’s `getByText("Active").first()` is a false pass (the active household
  already shows “Active”), and clicking switch then immediately `goto`‑ing races
  the `switchHousehold` `Set‑Cookie`. Rewrote to scope to the House B card, click
  its switch button, and **wait for B’s card to flip to Active** (gates on the
  action completing) before reading `/expenses`.
- **Task 10 — CI e2e job:** VERIFIED already correct (added in M0). Non‑blocking
  (`continue-on-error`, no `needs`), runs `pnpm test:e2e` with `HOUSEHOLD_PASSCODE`/
  `DATABASE_URL=file:./data/e2e.db`, uploads report on failure. No `db:init` step —
  the M4 `webServer.command` owns reset+migrate+seed. No change.
- **Tasks 11+12 — a11y + mobile Lighthouse** (commit `6a97a7b`, token‑only, 5 files).
  Mobile Lighthouse (chrome‑devtools) found 4 concrete gaps; all fixed:
  (a) header `SheetTrigger` menu button had no name → `aria-label="Open menu"`;
  (b) `recent-expenses` category pill = full category color on a 12.5% tint of
  itself (contrast **2.04**) → colored dot + `text-muted-foreground` (pie‑legend
  pattern); (c) `mobile-nav` active label `text-primary` on `bg-primary/10` =
  **4.4** → `bg-primary/5`; (d) `member-manager` avatar `text-primary`/`bg-primary/10`
  = **4.47** → solid `bg-primary`/`text-primary-foreground` (matches header avatar);
  (e) `(auth)/layout` `<div>`→`<main>` for the login landmark. **Mobile A11y after:
  100** on /dashboard, /categories, /members, /login (was 89/100/96/98); Best
  Practices/SEO 100. Dashboard mobile CWV under 4× CPU + Slow 4G: **LCP 2.18s**
  (good), **CLS 0.00** — Performance comfortably ≥90, no lazy‑load forced (charts
  already small client components). NOTE: `lighthouse_audit` MCP excludes
  Performance; the score is inferred from the trace CWV.
- **Gates:** tsc 0, Biome clean, **74 unit tests**, build ✅. e2e: all 4 specs
  (login, dashboard, add‑expense, switch‑household‑isolation) pass; proven twice.
  ⚠️ **Local‑only flake:** Playwright’s `webServer` cold‑start readiness probe
  intermittently hits the 300s timeout on a loaded machine (the build+start itself
  is ~13s, confirmed manually). NOT a test/code flake — every run where the server
  comes up passes 4/4 deterministically. Doesn’t affect CI (`reuseExistingServer:
  false`, fresh server). Clean twice‑run proof obtained via `reuseExistingServer`
  against a pre‑started prod server (5.3s + 2.7s, 4/4 both).

### 2026‑06‑15 (later) — M4 expenses redesign: e2e suite made reliably green (`9997fa3`)

Finished milestone M4 by getting `pnpm test:e2e` to pass all 3 specs (login,
dashboard, add‑expense) reliably (verified twice, incl. a cold `.next` run).
The M4 components/spec were already committed; the failure was entirely in the
**e2e harness ordering**. Root cause (one bug, two symptoms): **Playwright starts
`webServer` BEFORE running `globalSetup`** (the webServer plugin's `setup()`
resolves before any globalSetup hook — confirmed in PW source). The old
`e2e/global-setup.ts` seeded `data/e2e.db` too late → (a) cold‑start "no such
table: households" race, and (b) its `rmSync`+recreate moved the file out from
under the already‑running server's open libSQL connection →
`SQLITE_READONLY_DBMOVED` on `createExpense`'s INSERT (reads from page cache
still worked, so only writes failed; the form then left the bottom sheet open,
failing the spec's `toBeHidden()`).

- **Fix:** moved the whole DB lifecycle into the `webServer.command`
  (`pnpm db:e2e:reset && pnpm build && pnpm start`) via a new idempotent
  `scripts/e2e-db.ts` (reset + migrate + seed); deleted `e2e/global-setup.ts`.
  Schema/seed now exist before the server opens its connection, and the file is
  never deleted while the server holds it. Bumped webServer timeout 180s→300s
  (measured cold build is ~10s + ~1.5s reset, so huge headroom). Added
  `AUTH_URL`/`AUTH_TRUST_HOST` to the webServer env to silence Auth.js
  `UntrustedHost` logs under `next start`. **Did NOT touch** `expense-actions.ts`,
  queries, validators, or any M4 component — the form already preselects
  `categories[0]`/`members[0]`, which was correct.
- Gates: tsc ✅, Biome lint ✅, 74 unit tests ✅, build ✅. Committed `9997fa3` on
  `redesign/fresh-ledger`.

### 2026‑06‑12 (later) — Audit complete: 1.5, 1.6, all of milestone 3 + Claude Code config

- **1.5:** failed passcode attempts log + pay a constant ~1s delay (`FAILED_ATTEMPT_DELAY_MS`).
- **1.6:** `overrides: postcss >=8.5.10` in `pnpm-workspace.yaml` (needed `pnpm dedupe` —
  plain `pnpm install` short‑circuits and doesn't apply new overrides). `pnpm audit --prod` clean.
- **3.1:** five indexes (expenses household+date / category / member; categories household;
  household_members household) — `drizzle/0002_strong_sphinx.sql`, applied to dev DB.
- **3.4:** `createHousehold` seeds household+member+categories in one atomic `db.batch`.
- **3.5/3.6:** removed `maximumScale: 1` (WCAG pinch‑zoom) and the dead Bell button;
  `getSpendingByDay` zero‑fills the 31‑day window; "This Month" card shows "No spending
  recorded last month" instead of a bogus 0%; seeder uses local dates (`en-CA`), not UTC.
- **3.2 dead code:** deleted `hooks/use-mobile.ts`, `ui/input-group.tsx`, the unused
  `CurrencyDisplay` component (kept `formatCurrency`). **Decisions:** KEEP the unused
  `getExpenses` filters param (roadmap: filter UI) and the dead `users` table +
  `household_members.user_id` (Model B will need them).
- **CI:** checkout/setup-node bumped to v5 + `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (Node‑20
  action runtimes die Sept 2026).
- **Claude Code standards check** (via claude-code-guide agent against current docs): repo
  already matches 2026 baseline (root + nested CLAUDE.md, project skill, committed memory.md);
  added the one gap — committed `.claude/settings.json` (permissions allowlist for
  lint/test/build/tsc/db + read‑deny for `.env.local` and `data/`). Optional next steps noted
  in the audit doc: `.claude/agents/`, `.mcp.json`, claude-code-action PR review (v1.0.94+).
- Tests now **53**. The audit (`docs/2026-06-11-repo-audit.md`) is fully executed: M0–M3 done.

### 2026‑06‑12 — Audit milestone 2 (committed + pushed)

- **2.4 perf:** `getCurrentHousehold`/`listHouseholds` wrapped in React `cache()` (one DB
  round‑trip per request); `(app)/layout.tsx` fetches household/list/session via `Promise.all`.
- **2.2 error envelope:** all CRUD actions wrapped in `safeAction` (`lib/actions/safe-action.ts`)
  — throws are `console.error`‑logged and returned as `{error}`; `unstable_rethrow` keeps
  `redirect()` working (`verifyPasscode`); `logout` stays unwrapped (bare `<form action>` needs
  `Promise<void>`).
- **2.1 money → integer minor units:** `expenses.amount` (REAL) → `amount_minor` (INTEGER,
  fixed scale 100; `lib/money.ts`). Queries convert back with one `/100.0` so components are
  untouched. Migration `drizzle/0001_money_minor_units.sql` was **hand‑written** (table
  recreate + `CAST(ROUND(amount*100) AS INTEGER)`) because `drizzle-kit generate` needs an
  interactive rename prompt; snapshot/journal authored by hand — `pnpm db:generate` confirms
  no drift. Local dev DB migrated losslessly (15 rows, 2328.27 → 232827).
- **2.3 docs reconciliation:** CLAUDE.md (auth real, Next 16, conventions), src/lib/CLAUDE.md
  (libSQL, safeAction/scoping pattern, tests), README (status, features, ER diagram, gate
  format, API reference incl. household actions, env vars, roadmap → Model B). Removed the
  settings page's disabled "Google coming soon" card; fixed the member‑delete dialog copy.
- Tests now 49 (added money, dashboard‑exactness, safe‑action suites).

### 2026‑06‑15 — "Fresh Ledger" UI redesign: spec + implementation plan (NOT yet built)

Brainstormed + speced a full visual/interaction redesign and authored the implementation plan.
**Nothing implemented yet** — the app still looks as deployed.

- **Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`. Direction
  "Fresh Ledger" — light‑first warm (cream/white cards/indigo accent), dark parity, **Plus Jakarta
  Sans** display + Geist body (fixes the self‑referential `--font-sans` bug in globals.css), **Motion**
  library animations (page transitions, count‑ups, FAB→sheet morph, sliding nav pill; reduced‑motion
  respected), mobile‑first (bottom‑sheet forms, swipe‑to‑delete, safe‑area, ≥44px). Data/auth layers
  unchanged.
- **Best practices ported from `~/ishait/ivm/ivm-pwa`** (user asked): chosen tracks = **Biome**
  (replace ESLint), **Playwright** mobile e2e, **typed‑env** (zod); plus CVA/token conventions, a
  design‑system skill + `.claude/rules/ui.md`, dep‑pinning discipline. Declined: Docker, SSO/persona/
  fixture patterns (IVM‑specific).
- **Plan:** `docs/superpowers/plans/2026-06-15-fresh-ledger-redesign-README.md` (index + conventions)
  + 5 milestone files (`-01-repo-hardening` … `-05-grids-login-polish`), ~68 bite‑sized TDD tasks.
  Authored via a draft+adversarial‑critique workflow. **Execution order is strict M0→M5;** motion
  primitives + tokens are owned by Plan 02, Playwright scaffold by Plan 01 (later plans consume, not
  re‑create — banners mark the dedup). Use a single `redesign/fresh-ledger` branch.
- **Watch‑items in the plan README:** typed‑env must not break the DB‑free build or existing tests
  (relax during `NEXT_PHASE==='phase-production-build'` + shared vitest setupFiles); the dashboard
  hero must expose `[data-slot="hero-total"]`; FAB shares `layoutId="add-fab"`; amber‑crown token
  decision deferred to M1.

### 2026‑06‑11 — Repo audit + top‑5 hardening pass

**Full audit** written to `docs/2026-06-11-repo-audit.md` (graded B‑; findings cite file:line as of
`d39655c`). Then implemented the top‑5 high‑leverage tasks, TDD (41 tests, all green):

- **Tests + CI:** Vitest 4 (`vitest.config.ts`, `pnpm test`) — unit tests for `gate.ts`,
  `allow-list.ts`, `expense-schema`; integration tests (`src/lib/actions/scoping.test.ts`) against
  an in‑memory libSQL DB with real migrations (next/headers + next/cache mocked). GitHub Actions CI
  (`.github/workflows/ci.yml`): lint → tsc → test → build (build uses a dummy `AUTH_SECRET`; needs
  no DB).
- **Fail‑closed Google allow‑list:** new `src/lib/allow-list.ts` (`isEmailAllowed`); in production
  an EMPTY `HOUSEHOLD_ALLOWED_EMAILS` now denies all sign‑ins (dev stays open). `src/auth.ts` uses it.
- **Expiring passcode sessions:** `he_session` token format is now `v1.<issued-at>.<HMAC sig>`
  with server‑side 30‑day expiry (`SESSION_MAX_AGE_SECONDS` in `gate.ts`); legacy constant tokens
  are rejected — everyone re‑enters the passcode once. Bump `SESSION_VERSION` to mass‑invalidate.
- **Household‑scoped mutations:** all update/delete actions now filter by the active household and
  return `{error}` on foreign ids (checked via `.returning()`); `createExpense`/`updateExpense`
  verify categoryId/memberId belong to the household (`checkOwnership`); `getExpenseById(id,
  householdId)` is scoped and the edit page 404s on foreign expenses; `deleteCategory`'s
  accidental‑boolean guard rewritten (`select({id}).limit(1)`); rename/deleteHousehold check
  existence; expense‑list now surfaces delete errors.
- **Validators tightened:** `date` → `z.iso.date()` (real YYYY‑MM‑DD; column is compared
  lexicographically), `amount` → positive, ≤ 100M, ≤ 2 decimal places (epsilon for float noise).
- **Tooling:** pnpm 11 store migration forced a fresh `node_modules`; build‑script allowlist moved
  from `package.json#pnpm` (ignored by pnpm 11) to `pnpm-workspace.yaml` `allowBuilds`.

### 2026‑06‑05 → 06‑10 (previous session)

**Made the app deployable + a major hardening/feature pass, then renamed it to Outlay.**

- **Cleanup:** removed leftover create‑next‑app SVGs; real README; fixed lint.
- **Deployable serverless PWA** (`docs/superpowers/specs/2026-06-05-deployable-serverless-pwa-design.md`):
  better‑sqlite3 → **Turso/libSQL**; real migrations + seed (killed per‑request `ensureSeeded`);
  **passcode gate** (`proxy.ts` + Web Crypto HMAC, no JWT lib); **PWA** via `@serwist/turbopack`;
  fixed the `deleteMember` orphan bug.
- **Base UI fixes:** `MenuGroupRootContext` crash (a `DropdownMenuLabel` needs a `DropdownMenuGroup`
  wrapper); `nativeButton={false}` required when a shadcn `Button` renders a `<Link>`.
- **Dependency upgrade → latest stable:** next 16.2.7, recharts 3, react‑day‑picker 10, TS 6,
  @base-ui/react 1.5, zod 4.4, @types/node 25 (eslint kept at 9). Regenerated `chart.tsx` for recharts 3;
  fixed `calendar.tsx` (`table`→`month_grid`).
- **Repo audit** (multi‑agent, 25 real / 12 false positives) → `force-dynamic` on DB pages, surfaced
  `deleteMember` error in the UI, expense‑form local date (was UTC), `shadcn` → devDependencies.
- **Dead‑code removal:** 9 unused `ui/` primitives (calendar, chart, command, popover, scroll-area,
  separator, switch, table, tabs) + dead deps (next-auth, cmdk, react-day-picker — all re‑addable).
- **README:** Principal‑Tech‑Writer rewrite (4 Mermaid diagrams + Server‑Actions API reference).
- **Currency switcher** (`plans/2026-06-07-currency-switcher.md`): per‑household, default INR.
- **Multi‑household workspaces** (`plans/2026-06-07-household-ui-multi-workspace.md`):
  `getDefaultHousehold` → `getCurrentHousehold` (cookie), 12 sites rethreaded; create/rename/
  delete(cascade)/switch actions; sidebar switcher + `/households`; per‑household isolation verified.
- **Mobile drawer fix:** the desktop‑only `Sidebar` (`hidden md:flex`) was reused in the mobile Sheet →
  empty drawer; added an `inSheet` variant (root‑caused via browser repro).
- **Rename HomeExpense → Outlay:** code/UI/manifest/README/package + **GitHub repo renamed**
  (`home-expense` → `outlay`). User renamed the local folder to `outlay` too.
- **Google login (Model A)** (`plans/2026-06-09-google-login.md`): research concluded **stay on Turso**
  (Postgres not needed). Implemented Auth.js v5 + Google (JWT, allow‑list), route handler, `proxy.ts`
  coexistence, login Google button, `logout()` action, header user display, env vars; removed the mock
  `lib/auth.ts`. Verified wiring (passcode still works, providers/csrf endpoints, login UI).

**Commits pushed:** `d98f2d3` (Turso PWA + dep upgrade + currency), `c6c682b` (multi‑household + mobile
fix + Outlay rename), `9f35685` (Google login plan + CLAUDE.md fixes). Earlier reconciled a remote README
commit (`5b56777`) by rebasing and keeping the comprehensive README.

## Key decisions

- **Stay on Turso/libSQL** — Postgres not required to add auth; revisit only on a real scale/relational trigger.
- **Auth = Model B (implemented 2026‑06‑16):** households are per‑user (scoped by
  `household_members.user_id`). The passcode was **repurposed as an explicit superadmin** at `/admin`
  (NOT dropped, NOT the everyday path) — superseding the old "drop the passcode" plan: an explicit,
  secret god‑mode key is the owner's deliberate escalation while Google users are scoped. Deploy
  safety: `SESSION_VERSION` `v1`→`v2` invalidates every stale passcode cookie so none silently becomes
  superadmin. Sharing = **invite by email** (email‑on‑membership, claimed on login); existing prod data
  assigned to a **single named owner** (`mangatinanda@gmail.com`). Integration tests cover enforcement;
  no test‑login provider was added (kept `auth.ts` Google‑only).
- **Default currency INR.**
- **Deployed 2026‑06‑12** under the `mangatinanda` Vercel account (project
  `nanda-kumar-mangatis-projects/outlay`, **git‑connected** → pushes to `main` auto‑deploy).
  Production: **https://outlay.mangatinanda.me** (custom domain, now LIVE — the CNAME
  `outlay` → `cname.vercel-dns.com` at IONOS has resolved; Vercel serves it over HTTPS). The
  Vercel URLs `myoutlay.vercel.app` / `outlay-kappa.vercel.app` still resolve as aliases.
  Turso DB `outlay` (aws‑ap‑south‑1).

## Current state & open items

- **PR #2 MERGED (2026‑09‑05): in‑app notifications** — squash `2ff20a9` on `main`; feature branch deleted.
  The pre‑merge `/code-review 2 high` fixes landed in the same squash (see the 2026‑09‑05 work‑log entry).
  **Prod auto‑deploy succeeded** (GitHub deployment `success`; CI on `main` green). Verified live at
  `https://myoutlay.vercel.app` (HTTP 200; `/serwist/sw.js` carries the `/api/notifications/` NetworkOnly
  rule). Migration `0007` (notifications table + `households.notify_expense_over_minor`, additive) is applied
  by `scripts/migrate-if-prod.mjs` during the prod build — a failure there fails the build, so it applied.
- **⚠️ Custom domain `outlay.mangatinanda.me` does NOT resolve (seen 2026‑09‑05):** the `.me` registry answers
  NXDOMAIN for `mangatinanda.me` itself (`dig +trace` ends at the TLD SOA — no NS delegation) while whois still
  shows the registration ACTIVE, i.e. the registrar dropped/held the nameservers or the DNS zone was removed.
  Unrelated to the app; the Vercel aliases `myoutlay.vercel.app` / `outlay-kappa.vercel.app` still serve it,
  and the Google OAuth redirect URIs were registered for those hosts (2026‑06‑13), so sign‑in works there.
- **Deferred from the notifications review** (design/UX; details in the 2026‑09‑05 entry): owner‑as‑superadmin
  sees no bell while rows accrue for their user id; threshold form resets its input on `{error}`;
  non‑`menuitem` buttons inside the bell's `role="menu"`; `readAt` unused for unread styling; pre‑existing
  `activity`/`settlements` FK gaps in `cleanup.ts` + `deleteHousehold`; `src/lib/db/index.test.ts` flakes
  under CPU load (5s dynamic‑import timeout cascades into its sibling test).
- **Model B is live on prod** (since PR #1, 2026‑06‑22). Not verifiable from the repo: whether
  `pnpm db:migrate:model-b` (owner backfill → `mangatinanda@gmail.com`) was run against prod Turso — if the
  owner lacks a `household_members.user_id` link, run it (see the 2026‑06‑16 runbook in the work log).
- **Vercel Preview env vars still unset** — previews build (lazy `db` proxy, `520a94f`) but would 500 at
  runtime; set them only if you want clickable previews.
- **Prod facts:** Turso DB `outlay` (aws‑ap‑south‑1). Vercel env: `DATABASE_URL`, `TURSO_AUTH_TOKEN`,
  `AUTH_SECRET`, `HOUSEHOLD_PASSCODE` (= the **superadmin** key — keep owner‑only), `AUTH_GOOGLE_ID`,
  `AUTH_GOOGLE_SECRET`, `HOUSEHOLD_ALLOWED_EMAILS` (3 family Gmails). The Google consent screen is in
  "Testing" mode — family members must be added as test users (or publish the app). Local dev needs the same
  three Google vars in `.env.local`.
- Deliberately kept: `getExpenses` filters param (roadmap filter UI) and the `users` table. Optional future:
  filter UI, `.claude/agents/`, claude-code-action PR review.
- Stray, untracked/regenerable: `graphify-out/2026-09-05/` (graphify's pre‑update backup) and an empty
  `/Users/nanda/vibe-code/home-expense/.next` left from the folder rename — safe to delete.

## Commands

`pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm test` (vitest) · `pnpm exec tsc --noEmit` ·
`pnpm db:migrate` · `pnpm db:seed` · `pnpm db:init` (migrate + seed).
