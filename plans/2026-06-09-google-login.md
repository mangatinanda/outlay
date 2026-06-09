# Plan — "Sign in with Google" (Model A: identity layer)

**Date:** 2026-06-09
**Status:** Approved design — ready to implement
**Type:** Feature (auth)

---

## 1. Goal

Add **"Sign in with Google"** as an additional way into the app, alongside the existing shared
passcode. Google provides **real identity** (name/avatar, and an allow‑listed set of accounts
that may enter); households **stay shared workspaces** — no per‑user ownership yet. The passcode
**stays** as a coexisting option.

## 2. Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | Database | **Stay on Turso/libSQL.** Auth.js's Drizzle adapter supports libSQL; Postgres is *not* required. Revisit only on a real scale/relational trigger. |
| 2 | Access model | **Model A (identity layer) now.** Households remain shared workspaces; Google adds identity + an allow‑list gate. Model B (user‑owned) is documented in §8 for later. |
| 3 | Passcode | **Keep.** `proxy.ts` accepts a valid Auth.js session **OR** a valid `he_session` passcode cookie. |
| — | Session strategy | **JWT** (stateless; keeps `proxy.ts` simple; no DB writes per request). |
| — | DB schema | **No change for Model A** — JWT carries identity; we don't persist users yet. (Model B adds the adapter tables.) |

> **Why coexistence is safe here:** Model A applies **no per‑user access scoping** — a passcode
> user and a Google user get the *same* access to the shared households. The research's
> "passcode + Google = foot‑gun" warning only applies once households become per‑user (Model B),
> at which point the passcode must be removed. We capture that as a hard rule in §8.

## 3. What Google buys us in Model A

- A real **"Continue with Google"** sign‑in.
- An **allow‑list** (`HOUSEHOLD_ALLOWED_EMAILS`) so only your people can enter via Google —
  Google sign‑in is otherwise open to *any* Google account, which would be a hole.
- **Identity for display** — the header shows the signed‑in user's name/avatar instead of the
  hardcoded "Home User". Passcode users show as a generic "Guest".
- A foundation that makes **Model B** a smaller follow‑up.

What it does **not** do in Model A: own/scope households per user, link auth users to
`household_members`, or add invitations/permissions. (All §8.)

## 4. Technical design

- **Auth.js v5** = `next-auth@beta`; the Google provider ships inside it
  (`next-auth/providers/google`). *(Note: `next-auth` was removed earlier as dead code — this
  intentionally re‑adds it now that it's used.)*
- **`src/auth.ts`** — `export const { handlers, signIn, signOut, auth } = NextAuth({...})` with
  the Google provider, `session: { strategy: "jwt" }`, and a **`signIn` callback enforcing the
  allow‑list**, plus `jwt`/`session` callbacks to carry `email`/`name` onto the session.
- **Route handler** — `src/app/api/auth/[...nextauth]/route.ts` → `export const { GET, POST } = handlers`.
- **`proxy.ts`** — coexistence: allow if the Auth.js session exists, else if the passcode
  `he_session` verifies, else redirect to `/login`. The matcher **must exclude `/api/auth/*`**
  (and keep excluding `/login`, `~offline`, `_next`, static).
- **No database migration** — JWT-only, no adapter. The `users` table stays unused until Model B.
- `AUTH_SECRET` already exists (the passcode HMAC uses it) — Auth.js reuses the same variable.

### Allow‑list callback (the security crux)
```ts
callbacks: {
  signIn({ user }) {
    const allowed = (process.env.HOUSEHOLD_ALLOWED_EMAILS ?? "")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    // If unset, allow (dev convenience) — DOCUMENT that prod MUST set it.
    return allowed.length === 0 || allowed.includes((user.email ?? "").toLowerCase());
  },
}
```

## 5. File-by-file changes

| File | Change |
|---|---|
| `src/auth.ts` | **New** — `NextAuth({ providers: [Google], session: jwt, callbacks })` with allow‑list. |
| `src/app/api/auth/[...nextauth]/route.ts` | **New** — re‑export `GET/POST` from `handlers`. |
| `src/proxy.ts` | Accept Auth.js session OR passcode `he_session`; matcher excludes `/api/auth`. |
| `src/app/(auth)/login/page.tsx` | Add a "Continue with Google" form (`signIn("google")`) above a divider; keep `PasscodeForm`. |
| `src/components/auth/google-button.tsx` | **New** — client button → Server Action calling `signIn("google")`. |
| `src/lib/auth.ts` | Replace the mock `getSession()` with a thin wrapper over Auth.js `auth()` (returns the Google user, or a "Guest" identity for passcode sessions). |
| `src/components/layout/header.tsx` | Show the signed‑in user's name/avatar (from the session) + a working **Sign out** for Google users. |
| `.env.example` | Add `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `HOUSEHOLD_ALLOWED_EMAILS`. |
| `package.json` | Add `next-auth@beta`. |

## 6. External setup (Google Cloud)

1. Create an OAuth 2.0 Client (Web) + configure the OAuth consent screen.
2. Authorized redirect URIs (path is fixed by Auth.js):
   - `http://localhost:3000/api/auth/callback/google`
   - `https://<prod-domain>/api/auth/callback/google`
3. Put the client id/secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
4. While the consent screen is in **Testing**, only added test users can sign in; publish to
   "In production" for general access.

## 7. Implementation steps (each with a verification gate)

1. Install `next-auth@beta`; add `src/auth.ts` + the route handler. → verify: `tsc` clean.
2. Update `proxy.ts` for coexistence + matcher excludes `/api/auth`. → verify: passcode path
   still works (existing flow), `/api/auth/*` reachable.
3. Login page: add the Google button beside the passcode form. → verify: page renders both.
4. Wire `lib/auth.ts` → real `auth()`; update the header to show the user + Sign out.
5. Env + `.env.example` + Google Cloud creds; allow‑list. → verify end‑to‑end with a real Google
   account (allow‑listed passes; non‑listed is rejected; passcode still works).
6. Full check: `tsc` + lint + `build`; both sign‑in paths reach the dashboard.

## 8. Model B — user‑owned households (FUTURE, documented now)

When you want real per‑user access (sharing with people outside a trusted group, or true
tenancy), evolve to Model B. **This is out of scope for now** — captured so the path is clear.

- **Drop the passcode.** With per‑user scoping, a passcode user would bypass all household
  permissions. Replace the gate with Auth.js only.
- **Persist users:** add `@auth/drizzle-adapter` + the `accounts`, `sessions`,
  `verificationTokens` tables (the `users` table already exists) to the `sqlite-core` schema;
  one migration. Populate `users` on first Google sign‑in.
- **Per‑user households:** `getCurrentHousehold(userId)` filters households by membership
  (`household_members.user_id = userId`); update **all 12** resolution sites (use the
  rename‑to‑force‑compile‑errors technique again). The `he_household` cookie must be validated
  against the user's memberships (reject/403 if they don't belong).
- **Ownership + membership:** on create, insert a `household_members` row with
  `user_id = session.user.id`, role `admin`. Make `household_members.user_id` **NOT NULL** +
  `unique(householdId, userId)`; backfill existing rows (assign to a migrated user, or "claim on
  first login").
- **Later still:** email invitations, role‑based permissions, ownership transfer, audit log.
- **No component changes needed** for the switcher/provider — it's a data‑layer refactor
  (`getCurrentHousehold` filters differently); the UI automatically shows only the user's
  households.

## 9. Risks & gotchas

| Risk | Mitigation |
|---|---|
| Any Google account could enter | **Allow‑list** in the `signIn` callback (and Google "Testing" mode limits to test users until published). |
| `/api/auth/*` blocked by the gate → redirect loop | Exclude `/api/auth` (and `/login`) in the proxy matcher. |
| `redirect_uri_mismatch` | Redirect URI must be **exactly** `…/api/auth/callback/google` (http vs https, no trailing slash). |
| `next-auth@beta` is beta | Pin an exact version; re‑test on upgrade. |
| Stale mock `getSession()` | Replace with real `auth()` so the app doesn't read mock identity. |
| JWT can't be server‑revoked before expiry | Use a sensible `maxAge`; fine for this app. (DB sessions only if you later need instant revocation.) |

## 10. Out of scope (now)

- Per‑user household ownership, membership gating, invitations, roles (→ Model B, §8).
- Postgres migration (→ only on a real trigger).
- Database‑backed sessions / the Drizzle auth adapter (→ Model B).
