# Model B — User-Owned Households + Superadmin Passcode (Design)

**Date:** 2026-06-16
**Status:** Design — awaiting user review before planning
**Type:** Feature (auth / authorization)
**Supersedes:** §8 ("Model B — future") of `plans/2026-06-09-google-login.md`

---

## 1. Goal

Close the authorization gap surfaced by the 2026-06-16 audit: **any authenticated user can
read and write any household's data** because nothing binds a user to specific households.
Model B makes `household_members` a real authorization boundary so that **a Google user sees
and mutates only the households they belong to**, while keeping the existing shared passcode as
an explicit, deliberate **superadmin** key (not the everyday way family members get in).

Success = after this ships:
- A Google user with no membership in household *H* cannot read *H*, switch to *H*, or mutate
  *H* — verified by tests.
- The passcode, entered at `/admin`, grants an explicit superadmin who can do everything across
  every household.
- Existing production data is preserved and owned by `mangatinanda@gmail.com`.
- All existing safety properties (household-scoped mutations, fail-closed allow-list, expiring
  passcode token) survive.

## 2. Background — the gap we are closing

The audit (`docs/` workflow result, 2026-06-16) found:
- `getCurrentHousehold()` resolves the `he_household` cookie with `eq(households.id, id)` only —
  no membership join (`household-queries.ts:19-30`).
- `listHouseholds()` returns **all** households unfiltered (`household-queries.ts:32-34`).
- `switchHousehold(id)` accepts **any** existing id after a bare existence check
  (`household-actions.ts:45-59`).
- `household_members.userId` exists (`schema.ts:29`) but is **never written or read** — dead.
- The data layer reads the logged-in user's identity **zero times**.

Everything funnels through those three functions plus the two household-id-taking actions
(`renameHousehold`, `deleteHousehold`), so the fix is centralizable.

## 3. Locked decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Passcode | **Keep as superadmin**, login moved to `/admin` | Owner wants a do-everything master key; closes the hole because Google users become scoped. |
| 2 | Sharing | **Invite by email** | Members invite an email; access granted on the invitee's next sign-in. Makes isolation real and future-proof. |
| 3 | Invite storage | **Email column on `household_members`, claim-on-login** | No tokens, no extra table, no email delivery — leverages allow-list + Google. |
| 4 | Existing data | **Single named owner = `mangatinanda@gmail.com`** | Existing households become his; he invites the others. |
| 5 | Admin surface | **`/admin` = passcode login only**; superadmin then uses the normal app with god-mode scoping | Smallest scope that satisfies "do everything." A dedicated console is a future add-on. |
| 6 | Session strategy | **Stay JWT, no DB adapter** | Persist the user row ourselves on sign-in; no `accounts`/`sessions`/`verificationTokens` tables. |
| 7 | Passcode-cookie precedence | **A valid passcode cookie ⇒ superadmin** (checked before the Google session) | The passcode is a deliberate elevation; entering it means "act as admin." |
| 8 | Deploy safety | **Bump `SESSION_VERSION` `v1`→`v2`** | Invalidates every outstanding passcode cookie so family members' existing cookies do NOT silently become superadmin; only a fresh `/admin` unlock elevates. |

## 4. The principal model

After this change there are exactly two kinds of principal, resolved by a single new function
`getCurrentActor()`:

```ts
// src/lib/auth/actor.ts
export type Actor =
  | { kind: "superadmin" }
  | { kind: "user"; userId: string; email: string };
```

- **superadmin** — a valid `he_session` passcode cookie. Bypasses all membership scoping; sees,
  switches to, and mutates every household. Anonymous (the token carries no identity).
- **user** — a Google (Auth.js JWT) session carrying `session.user.id`. Scoped to households
  where a `household_members` row links `userId` to them.

`getCurrentActor()` is `cache()`d (one resolution per request) and resolves in this order:
1. If a valid passcode cookie is present (`verifySession`) → `{ kind: "superadmin" }`.
2. Else if `auth()` yields `session.user.id` → `{ kind: "user", userId, email }`.
3. Else → `null` (proxy normally redirects before this; callers treat `null` as "no access").

`requireActor()` is a thin wrapper that throws (for server actions) when `null`.

## 5. Data model changes

`household_members` gains one column and three indexes. **No other table changes.**

```ts
// src/lib/db/schema.ts — householdMembers
email: text("email"),            // NEW — nullable; lowercased invite/login address
// userId stays nullable (FK -> users.id)
// indexes (added):
//   uniqueIndex("household_members_household_user_unq").on(householdId, userId)
//   uniqueIndex("household_members_household_email_unq").on(householdId, email)
//   index("household_members_email_idx").on(email)
```

SQLite treats multiple `NULL`s as distinct, so the unique indexes do **not** conflict with the
many existing rows that have null `userId`/`email`.

A `household_members` row is now one of three kinds:

| Kind | `userId` | `email` | Grants access? | Example |
|---|---|---|---|---|
| **Auth membership** | set | set | **yes** | A signed-in user who belongs to the household |
| **Pending invite** | null | set | yes, after claim | An invited email not yet signed in |
| **Attribution-only** | null | null | no | A label like "Kids" you attribute expenses to |

"Claim on login" turns a *pending invite* into an *auth membership* by setting `userId`.

## 6. Identity & session (auth.ts)

`src/auth.ts` gains user persistence and id propagation — still JWT, still no adapter.

- **`signIn` callback** → `canSignIn(email)`: allowed if the email is in
  `HOUSEHOLD_ALLOWED_EMAILS` (existing `isEmailAllowed`, fail-closed in prod) **OR** has any
  `household_members` row matching that email. This lets the owner invite people without editing
  the env var; the allow-list still bootstraps the owner.
- **`jwt` callback** → on initial sign-in (`account` present): `upsertUserByEmail({ email, name,
  image })` returns a stable `users.id`; set `token.userId`. Then `claimInvites(email, userId)`
  links any pending-invite rows. On subsequent requests `account` is absent → no DB write; the
  id is already in the token.
- **`session` callback** → copy `token.userId` → `session.user.id`.
- **TS module augmentation** (`types/next-auth.d.ts`) for `session.user.id` and `token.userId`.

`upsertUserByEmail` is keyed on the unique `users.email` (`INSERT … ON CONFLICT(email) DO UPDATE
SET name, image RETURNING id`) so a pre-seeded owner row is reused, not duplicated.

## 7. Authorization layer (the core)

A new `src/lib/auth/membership.ts` exposes pure helpers used by queries and actions:

```ts
isMember(userId, householdId): Promise<boolean>
userHouseholds(userId): Promise<Household[]>           // households the user belongs to
assertCanAccessHousehold(actor, householdId): Promise<void>   // throws on denial
```

The three resolvers are rewritten to be actor-aware (`household-queries.ts`,
`household-actions.ts`):

- **`getCurrentHousehold()`** — superadmin: cookie household (any) or first overall. user: cookie
  household **iff a member**, else their first membership, else `null`.
- **`listHouseholds()`** — superadmin: all. user: `userHouseholds(userId)`.
- **`switchHousehold(id)`** — superadmin: any existing. user: membership required, else
  `{ error: "Household not found" }` (don't leak existence).
- **`renameHousehold(id)` / `deleteHousehold(id)`** — call `assertCanAccessHousehold` first
  (these take an id directly, not via `getCurrentHousehold`). `deleteHousehold` keeps the
  "can't delete your only household" guard, now scoped to the user's set.
- **`createHousehold`** — for a user actor, additionally insert an **admin** auth-membership
  (`userId`, `email`, role `admin`) alongside the seeded label member. For a superadmin actor,
  no auth-membership is added (superadmin sees it via god-mode; can invite later).

**Why this is sufficient:** every per-household page and the member/category/expense/settings
actions derive their household from `getCurrentHousehold()` and scope mutations with
`and(eq(table.id, id), eq(table.householdId, household.id))`. Once `getCurrentHousehold()` only
ever returns an accessible household, those ~20 call sites are transitively safe — no per-call
changes needed beyond the centralized resolvers and the two id-taking household actions.

## 8. Route split + proxy

- **`/login`** — Google-only (remove `PasscodeForm`).
- **`/admin`** — new page hosting `PasscodeForm` (the superadmin gate). Success sets the
  `he_session` cookie and redirects to `/dashboard`.
- **`proxy.ts`** — logic unchanged (Google session **OR** valid passcode cookie grants entry);
  the matcher adds `admin` to the exclusion list so `/admin` is reachable unauthenticated:
  `"/((?!login|admin|api/auth|~offline|_next|.*\\..*).*)"`.
- **`SESSION_VERSION`** bumped `v1`→`v2` in `gate.ts` so all current passcode cookies are
  invalidated on deploy (see decision #8).

## 9. Invitations (invite by email)

- **`inviteToHousehold(email)`** (`src/lib/actions/invite-actions.ts`) — current household;
  caller must be superadmin or an admin member. Lowercases + validates the email
  (`invite-schema.ts`), rejects duplicates (`unique(householdId, email)`), inserts a pending
  invite row (`email`, `userId: null`, role `member`, `name` derived from the email local-part).
- **`removeFromHousehold(memberId)`** — revokes access / deletes the row, keeping the existing
  "member still has expenses" guard from `deleteMember`.
- **Claim** — handled in the `jwt` callback's sign-in branch (`claimInvites`), `UPDATE
  household_members SET user_id = ? WHERE email = ? AND user_id IS NULL`. Caveat: a user invited
  *after* they last signed in sees it on their next sign-in (acceptable for this app).
- **UI** — `/members` (household-scoped) gains an "Invite by email" field and an access badge per
  member (Has access / Invited / Attribution-only). Existing attribution-member CRUD is unchanged.

## 10. Zero-household onboarding

A Google user who is allow-listed but has no membership (e.g. the two non-owner family members
right after migration) gets `getCurrentHousehold() === null`. The app layout detects a *user*
actor with zero households and renders an onboarding state ("Create your first household, or ask
to be invited") with a create-household CTA, instead of the empty dashboard shell. Superadmin
never hits this (always sees all).

## 11. Migration

A one-time, idempotent script `scripts/migrate-model-b-owner.ts` (wired as `pnpm
db:migrate:model-b`):
1. `upsertUserByEmail({ email: "mangatinanda@gmail.com", name: "Nanda" })` (name refreshed on
   first real Google sign-in).
2. For every household lacking any auth-membership, insert an admin auth-membership for the owner
   (`userId`, `email`, role `admin`).

Run order on deploy: schema migration (`pnpm db:migrate`) → owner backfill (`pnpm
db:migrate:model-b`). Safe to re-run.

## 12. Sign-out / header

- `logout()` already clears both `he_session` and the Google session — unchanged.
- `Header` shows the Google user's name/avatar for a user actor, and an explicit **"Superadmin"**
  label (not "Guest") for a passcode actor. The layout passes the actor kind to `Header`.

## 13. Testing strategy

- **Integration (Vitest, in-memory libSQL)** — primary coverage for enforcement. New tests for
  `getCurrentHousehold`/`listHouseholds`/`switchHousehold`/`assertCanAccessHousehold` proving:
  user A sees only A; user A cannot switch to or rename/delete B; superadmin sees both;
  zero-household user resolves to `null`. Mock `getCurrentActor` to inject the actor.
  `claimInvites`/`upsertUserByEmail` get their own tests. Update existing `scoping.test.ts` /
  `auth-actions.test.ts` to provide an actor.
- **e2e (Playwright)** — keep the smoke suite on the passcode path, now at `/admin` (superadmin):
  update `login()` helpers and `login.spec.ts`; `switch-household-isolation.spec.ts` continues to
  pass (superadmin sees A+B; active-household scoping still flips the expense set).
- **Per-user e2e — out of scope (decided 2026-06-16).** We rely on the integration tests above
  for membership enforcement; no test-login provider is added to `auth.ts`. The e2e suite stays
  superadmin-only (passcode at `/admin`). Revisit if we later want browser-level per-user coverage.

## 14. Security considerations

- **Superadmin is anonymous** — no audit trail for superadmin actions. Accepted for a family app.
- **Don't distribute the passcode** — anyone with it is superadmin; family members must use
  Google. The `SESSION_VERSION` bump enforces a clean cut at deploy.
- **No test-login provider** — `auth.ts` exposes only the Google provider in every environment;
  there is no credentials/bypass path that could fail open.
- **Invites grant sign-in** — inviting an email is, by design, granting entry (via the
  `canSignIn` membership branch). Only superadmin/admin members can invite.
- **No existence leakage** — denied switches/renames return generic "Household not found".
- Out of scope (noted, not built): passcode attempt rate-limiting/lockout, role-based permission
  granularity beyond admin-can-invite/delete, ownership transfer, a dedicated `/admin` console.

## 15. File-by-file change list

**New**
- `src/lib/auth/actor.ts` — `Actor`, `getCurrentActor()`, `requireActor()`
- `src/lib/auth/membership.ts` — `isMember`, `userHouseholds`, `assertCanAccessHousehold`
- `src/lib/auth/users.ts` — `upsertUserByEmail`, `claimInvites`, `canSignIn`
- `src/app/(auth)/admin/page.tsx` — passcode login page
- `src/lib/actions/invite-actions.ts` — `inviteToHousehold`, `removeFromHousehold`
- `src/lib/validators/invite-schema.ts` — email validation
- `types/next-auth.d.ts` — `session.user.id` / `token.userId` augmentation
- `scripts/migrate-model-b-owner.ts` — owner backfill
- `drizzle/000X_model_b.sql` — generated (email column + indexes)
- Tests: `actor.test.ts`, `membership.test.ts`, `users.test.ts`,
  `household-queries.test.ts` (scoping), `invite-actions.test.ts`

**Modified**
- `src/lib/db/schema.ts` — email column + indexes
- `src/auth.ts` — `signIn`/`jwt`/`session` callbacks (Google provider only)
- `src/lib/gate.ts` — `SESSION_VERSION` → `v2`
- `src/proxy.ts` — matcher excludes `admin`
- `src/lib/queries/household-queries.ts` — actor-aware `getCurrentHousehold`/`listHouseholds`
- `src/lib/actions/household-actions.ts` — membership checks; creator membership
- `src/app/(auth)/login/page.tsx` — Google-only
- `src/app/(app)/layout.tsx` — pass actor to Header; zero-household onboarding
- `src/components/layout/header.tsx` — "Superadmin" label
- `src/app/(app)/members/page.tsx` + `src/components/members/member-manager.tsx` — invite UI + badges
- `e2e/login.spec.ts`, `e2e/switch-household-isolation.spec.ts` — login via `/admin`
- `package.json` — `db:migrate:model-b` script
- `CLAUDE.md`, `memory.md` — auth-model docs (post-implementation)

## 16. Rollout order

1. Merge code + schema migration.
2. Deploy (Vercel). `SESSION_VERSION` bump logs out all passcode sessions.
3. Run `pnpm db:migrate` then `pnpm db:migrate:model-b` against prod Turso.
4. Owner unlocks `/admin` once (superadmin) to verify; family members sign in with Google
   (scoped). Owner invites the other two to the shared household(s) from `/members`.
