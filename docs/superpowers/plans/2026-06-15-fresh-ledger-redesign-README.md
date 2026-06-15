# Fresh Ledger Redesign — Plan Index & Conventions

> Master index for the Outlay "Fresh Ledger" UI redesign + repo hardening.
> **Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`.
> Authored 2026-06-15 via a draft+adversarial-critique workflow (9 sections, 18 agents). Each plan
> file is self-contained with its own header; this README locks sequencing and the decisions that
> span files.

## Execute in this order (strict)

| # | Plan | Milestone | What |
|---|------|-----------|------|
| 1 | `2026-06-15-redesign-01-repo-hardening.md` | **M0** | Biome (replace ESLint), typed-env (zod), Playwright e2e scaffold |
| 2 | `2026-06-15-redesign-02-design-foundation.md` | **M1** | Font fix + Plus Jakarta, Fresh Ledger tokens (light+dark), motion primitives, design-system skill + UI rule |
| 3 | `2026-06-15-redesign-03-shell-and-dashboard.md` | **M2+M3** | App shell (transitions, sidebar, mobile nav, header) + dashboard redesign |
| 4 | `2026-06-15-redesign-04-expenses-and-forms.md` | **M4** | Expenses list + add/edit bottom sheet + swipe-to-delete |
| 5 | `2026-06-15-redesign-05-grids-login-polish.md` | **M5+M6** | Grids, settings, login, empty states, e2e + a11y + Lighthouse |

**Hard dependencies:** M1 (tokens + motion primitives) must be merged before M2–M6 — they consume
`src/components/motion/*` and the `shadow-card`/`font-display`/indigo `--primary` tokens. M0 should
land first (its Biome reformat is an isolated commit; later files are linted with Biome).

## Single source of truth (resolves cross-file duplication)

The plans were drafted by independent agents, so a few setup steps appear in more than one file.
**Canonical ownership:**

- **Motion primitives** (`PageTransition`, `AnimatedNumber`, `Stagger`/`StaggerItem`, `MotionCard`)
  and the **count-up helper** → created **once in Plan 02 (M1)**. Plan 03's Tasks 8–10 contain
  re-creation steps from a separate draft — **skip them**; import from `@/components/motion` (a banner
  marks this in Plan 03).
- **Playwright scaffold** (`@playwright/test`, `playwright.config.ts`, `test:e2e` script, CI e2e job)
  → created **once in Plan 01 (M0)**. Plans 03/04/05 add **spec files only**; do NOT re-install or
  re-create the config (banners mark this). Plan 04's draft includes an alternate **port-3100** config —
  ignore it; the canonical config is Plan 01's (Pixel-7, `baseURL http://localhost:3000`, webServer
  seeding `file:./data/e2e.db` with `HOUSEHOLD_PASSCODE`).
- **`src/app/globals.css` token/font layer** → owned by Plan 02. Later `@layer utilities` appends
  must append-once.

## Global conventions

- **Branch:** one `redesign/fresh-ledger` branch off `main` for the whole effort (not per-task
  branches — some section drafts suggested those; ignore). Optionally land M0 as its own PR first.
- **Commit trailer (canonical for this repo):** `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
  All 12 prior commits use it; the plans are normalized to it. (Some drafts proposed
  "Claude Opus 4.8 (1M context)" per the harness default — overridden here for repo consistency.)
- **Token-only styling:** named utilities `shadow-card`/`shadow-float`/`shadow-pop`, `font-display`,
  `tabular-nums`, semantic color/radius utilities. No hardcoded hex/rgb/box-shadow. (A few sections use
  the equivalent arbitrary form `shadow-[var(--shadow-card)]`; prefer the named utility — both resolve
  in Tailwind v4 since the token is defined in `@theme`.)
- **Invariants:** no `src/lib/queries/*` or `src/lib/actions/*` behavior/signature changes; props
  unchanged; next-themes stays; restyle `src/components/ui/*` (don't fork); cva + `cn`; lucide per-icon;
  mobile safe-area + ≥44px + no 390px overflow; respect `prefers-reduced-motion`; AA contrast.
- **Verification gates (per task):** logic → Vitest TDD; visual → `pnpm exec tsc --noEmit` + `pnpm lint`
  + `pnpm build` + chrome-devtools screenshots (1440×900 and 390×844, light AND dark); flows →
  `pnpm test:e2e`. The DB-free build invariant ((app) pages are force-dynamic) must hold throughout.

## Watch-items the critics surfaced (resolve while executing)

1. **typed-env must not break the build or the existing tests.** `src/lib/env.ts` is parsed at import
   time and is transitively imported by the build graph, so: (a) relax validation during
   `process.env.NEXT_PHASE === 'phase-production-build'` (the CI build sets only `AUTH_SECRET` +
   `DATABASE_URL`); (b) add a shared Vitest `setupFiles` that seeds all required vars before any import,
   so the existing `dashboard-queries.test.ts` / `scoping.test.ts` (which import `@/lib/db` but don't set
   `HOUSEHOLD_PASSCODE`) keep passing. Plan 01's typed-env tasks cover both — verify the full `pnpm test`
   suite stays green after.
2. **Stable e2e selector contract:** Plan 03's dashboard hero must expose `[data-slot="hero-total"]`;
   Plan 04's add-expense e2e asserts against it. Keep the name identical.
3. **FAB shared-element id:** Plan 02/M2's mobile-nav FAB and Plan 04's add/edit sheet share
   `layoutId="add-fab"`; exactly one element may own it at a time.
4. **Amber crown token (open decision):** the admin Crown uses `text-amber-500` (a stock color, not a
   Fresh Ledger token). In M1, either add a semantic accent token or explicitly exempt it like the
   Google brand SVG; the M5 a11y sweep checks its contrast.
5. **Biome `useSortedClasses`** is a nursery rule with an *unsafe* autofix — the one-time pass uses
   `biome check --write --unsafe` and the rule level is `error` so CI enforces sorting. Expect some
   imperfect orderings on heavy Tailwind v4 variant usage (known limitation, not a bug).
6. **e2e env wiring:** CI's e2e job needs `HOUSEHOLD_PASSCODE` (and the `file:./data/e2e.db` DATABASE_URL)
   set so the seed fixture fires; the switch-household isolation seed keys on the DB filename.

## How to execute

Per the writing-plans handoff, use **superpowers:subagent-driven-development** (a fresh subagent per
task with two-stage review between tasks) — recommended for a plan this size — or
**superpowers:executing-plans** for batched inline execution with checkpoints. Either way, follow the
strict file order above and respect the single-source-of-truth ownership.
