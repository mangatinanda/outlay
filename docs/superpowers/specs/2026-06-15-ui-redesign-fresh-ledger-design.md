# Outlay UI Redesign — "Fresh Ledger" + repo hardening

> **Status:** Design spec, approved 2026-06-15. Implementation plan to follow (writing-plans).
> **Scope:** Full visual + interaction redesign of every authenticated surface + login, light-first
> with dark parity, Motion-powered animations, mobile-first. Plus three repo-hardening tracks ported
> from `ivm-pwa` (Biome, Playwright e2e, typed-env). Data/auth layers are **not** changed.

## 1. Goals & non-goals

**Goals**
- Replace the current flat, monochrome, serif-by-accident look with a warm, friendly, modern
  "Fresh Ledger" design — light-first, with a matching dark theme.
- Add tasteful, performant motion (page transitions, list cascades, count-ups, a FAB→sheet
  shared-element morph, a sliding nav indicator), all respecting `prefers-reduced-motion`.
- Make every screen genuinely good on small screens (thumb-reachable forms, safe-area handling,
  ≥44px targets, swipe-to-delete).
- Adopt the mature engineering practices from `ivm-pwa` that fit Outlay.

**Non-goals (explicitly out of scope)**
- No data-layer, query, or Server Action behavior changes (the audit already hardened those).
  Components keep receiving the same props; this is a presentation + interaction redesign.
- No new product features (expense filtering UI, budgets, CSV, splitting) — separate roadmap.
- IVM-specific patterns that don't apply: SSO brokering, persona routing, fixture-fallback API
  layer. Not ported.
- Docker compose — deferred (user decision).

## 2. Current state (what we're fixing)

- **Font bug:** `src/app/globals.css:10` is `--font-sans: var(--font-sans)` (self-referential), while
  `src/app/layout.tsx` assigns Geist to `--font-geist-sans`. Result: `font-sans` resolves to nothing
  → headings render in a serif fallback. Visible on the live app.
- **No brand color:** the whole palette (`globals.css` `:root`/`.dark`) is grayscale OKLCH (chroma 0).
  Flat, clinical.
- **Flat surfaces:** dark cards with hairline borders, little depth, generic spacing.
- **Charts:** a bleak empty grid for new users; bar chart only.
- **Mobile:** bottom nav lacks safe-area inset; forms are full-page navigations; no swipe actions.

## 3. Design direction — "Fresh Ledger"

Light-first, warm, friendly family-app feel. Floating white cards on a soft cream canvas, real soft
shadows, colorful category chips, a single indigo action accent, friendly rounded display type. Dark
mode mirrors it on a warm near-black (not pure black).

### 3.1 Typography
- **Display / headings / big numbers:** **Plus Jakarta Sans** (via `next/font/google`), exposed as
  `--font-display`. Friendly, geometric, rounded.
- **Body / UI:** keep **Geist Sans** (`--font-geist-sans`); fix the `--font-sans` mapping bug.
- **Money:** always `font-variant-numeric: tabular-nums`.
- `globals.css` `@theme`: set `--font-sans: var(--font-geist-sans)` (fix) and add
  `--font-display: var(--font-display)`. Headings/figures use a `font-display` utility.

### 3.2 Color tokens (OKLCH; light + dark)
Replace the grayscale palette. Defined as raw CSS vars in `:root`/`.dark`, mapped via `@theme inline`
(existing structure — extend, don't rewrite). Indicative values (final values tuned during impl):
- **Light:** `--background` warm cream (~`oklch(0.985 0.006 85)`); `--card` pure white; `--primary`
  indigo (~`oklch(0.52 0.20 277)`); `--primary-foreground` white; soft `--muted`/`--accent` warm
  neutrals; `--border` very light warm.
- **Dark:** `--background` warm near-black (~`oklch(0.17 0.01 285)`, not pure black); `--card` a
  slightly lifted warm slate; same indigo primary (tuned for contrast).
- **Category colors:** keep the existing vibrant `CATEGORY_COLORS` (`src/lib/constants.ts`) — they're
  good and already used for chips/charts.
- **Charts:** retune `--chart-*` to the indigo/violet family + category colors.

### 3.3 Shape & depth
- Generous radii (cards `rounded-2xl`/`rounded-3xl`); the existing `--radius` scale already supports
  this — bump the base and lean on `radius-2xl/3xl`.
- Replace hairline borders with **soft layered shadows** (add `--shadow-card`, `--shadow-float`
  tokens). More white space, larger touch targets.

### 3.4 Dark mode
- Keep `next-themes` (already wired in `src/components/providers.tsx`) — it handles no-flash and the
  `.dark` class. Light is the design lead; dark is a tuned mirror, not an afterthought. Toggle stays.

## 4. Motion system

Add the **`motion`** library (successor to Framer Motion; `motion/react`). Resolve the exact latest
stable at install time (do not pin from memory); pin exact, commit lockfile.

**Reusable primitives** (so motion is centralized, not scattered) under `src/components/motion/`:
- `PageTransition` — wraps page content; fade + small slide on route change.
- `AnimatedNumber` — count-up for summary figures (currency-aware).
- `Stagger` / `StaggerItem` — cascade entrances for card grids and lists.
- `MotionCard` / tap primitive — spring on press (`whileTap` scale), entrance rise.

**Signature interactions**
- FAB **morphs into the add-expense bottom sheet** (shared-element via `layoutId`).
- Bottom-nav active item: **sliding pill indicator** (`layoutId`).
- Charts draw in; numbers count up; list items cascade.

**Reduced motion (hard requirement):** all primitives check `prefers-reduced-motion` (via
`useReducedMotion`) and degrade to instant/opacity-only. No motion is load-bearing for usability.

## 5. Per-surface design

- **Dashboard** (`src/app/(app)/dashboard`, `src/components/dashboard/*`): hero "spent this month"
  card (indigo gradient, count-up, MoM pill); soft stat chips with colored icon tiles; **gradient
  area** daily-spending chart (replaces empty bar grid) with a friendly empty state; donut + legend
  with % chips; recent-expenses list with category chips.
- **Expenses** (`src/app/(app)/expenses`, `src/components/expenses/expense-list.tsx`): sticky
  date-group headers; each row a soft card with category color chip; **swipe-to-delete on mobile**
  (Motion drag → confirm); tap to edit.
- **Add / Edit** (`expense-form.tsx`, `expenses/new`, `expenses/[id]/edit`): on mobile a
  thumb-reachable **bottom sheet** the FAB morphs into (desktop keeps the page/dialog); category as a
  horizontal **chip selector** (not a dropdown); large amount display; members as avatar chips.
- **Categories / Members / Households** (`*-manager.tsx`): soft card grids, colored chips, tap/hover
  lift, staggered entrance.
- **Settings** (`src/app/(app)/settings`): restyled cards (currency switcher, household, about).
- **Login** (`src/app/(auth)/login`): warm centered card; restyle Google button + passcode form.
- **Empty states:** friendly throughout (new-user dashboard, empty expense/category/member lists).

## 6. App shell & mobile-first specifics

- **Mobile bottom nav** (`src/components/layout/mobile-nav.tsx`): keep the 5-item + center FAB shape;
  restyle with the sliding active pill, elevated indigo FAB, spring press, **`env(safe-area-inset-bottom)`
  padding**, ≥44px targets. (Households/Settings stay in the drawer.)
- **Desktop sidebar** (`sidebar.tsx`): soft active pill (indigo tint), matched styling; the in-sheet
  mobile variant inherits it.
- **Header** (`header.tsx`): cleaner; greeting + household name + avatar.
- **Page transitions** via `PageTransition` in the `(app)` layout.
- Stat grid stays 2-up on mobile; horizontal-scroll chip rows; bottom-sheet forms.

## 7. Component & code conventions (adopted from ivm-pwa)

- **CVA + `cn()` idiom** for every new/restyled component (variants in `cva()`, merge with `cn` from
  `src/lib/utils.ts`). Standardize existing components to this.
- **Token-only styling:** no hardcoded hex/rgb for color/radius/shadow — use Tailwind utilities that
  resolve to tokens (`bg-card`, `text-muted-foreground`, `rounded-2xl`, `shadow-[--shadow-card]`,
  `font-display`). New value → add a token in `globals.css` first.
- **lucide-react** per-icon imports (already the pattern).
- **`shadcn`/Base UI primitives** restyled via tokens/classes — don't fork the library.
- **`.claude` additions:**
  - `.claude/skills/design-system/SKILL.md` — Fresh Ledger tokens, type scale, motion rules, voice
    ("friendly, plain; no exclamation spam"), component-porting workflow. Invoke before UI work.
  - `.claude/rules/ui.md` — path-scoped (frontmatter `paths:` for `src/components/**`, `src/app/**`)
    short rule reminding: token-only styling, CVA idiom, reduced-motion, mobile targets.

## 8. Repo hardening tracks (ported from ivm-pwa)

### 8.1 Biome (replace ESLint)
- Add `@biomejs/biome` (exact latest stable); add `biome.json` (Next/React recommended +
  `useSortedClasses` for `cn`/`cva`/`clsx`; ignore CSS formatting).
- `package.json`: `lint` → `biome check .`, add `format` → `biome format --write .`. Remove
  `eslint`, `eslint-config-next`, `eslint.config.mjs`.
- CI: replace the lint step.
- `.claude/settings.json`: add a **PostToolUse(Edit|Write) hook** running `biome check --write` on
  changed files (auto-format), modeled on ivm-pwa's `post-edit-check.mjs`.
- **Do this first, as its own commit,** so the redesign diffs aren't polluted by reformatting.

### 8.2 Playwright e2e (mobile-first)
- Add `@playwright/test` (exact latest stable); `playwright.config.ts` with a **Pixel-7** mobile
  project, `webServer` starting `next dev`, `baseURL http://localhost:3000`, 2 retries in CI / 0 local.
- e2e runs against a **temp seeded libSQL file** (`DATABASE_URL=file:./data/e2e.db`) with a known
  `HOUSEHOLD_PASSCODE`; auth via the **passcode path** (Google needs a real IdP, so it's smoke-only).
- Tests in `e2e/`: passcode login → dashboard; add an expense → appears in list + dashboard; switch
  household isolates data. (Mirror ivm-pwa's "don't assert `getByRole('alert')`" gotcha → `.claude/rules`.)
- CI: a **separate, non-blocking** `e2e` job; upload `playwright-report/` on failure (7-day retention).
- `scripts`: `test:e2e` → `playwright test`.

### 8.3 Typed env (zod)
- `src/lib/env.ts` — zod schema validating server env (`DATABASE_URL`, `AUTH_SECRET`,
  `HOUSEHOLD_PASSCODE`, `AUTH_GOOGLE_ID/SECRET`, `HOUSEHOLD_ALLOWED_EMAILS`, optional
  `TURSO_AUTH_TOKEN`), parsed once and exported typed. Import from `src/lib/db/index.ts`, `src/auth.ts`,
  `src/lib/gate.ts`, `src/lib/actions/auth-actions.ts` instead of raw `process.env`. Fails fast with a
  clear message. Keep server-only; don't break the no-DB build (validation must tolerate build-time).

### 8.4 Dependency discipline (adopted as a rule)
- Pin exact versions (no `^`/`~`); resolve latest-stable from the registry at install time, never from
  memory; let pnpm write the lockfile and commit it; `allowBuilds` in `pnpm-workspace.yaml` (already
  done); pin `packageManager` + `engines.node>=24` in `package.json`. Recorded in CLAUDE.md.

## 9. Milestones (implementation order)

- **M0 — Hardening foundation (separate commits, before UI churn):** Biome migration; typed-env;
  Playwright scaffold (config + one smoke test) + CI e2e job.
- **M1 — Design foundation:** fix font bug + add Plus Jakarta Sans; Fresh Ledger tokens (light+dark,
  shadows, radii); add `motion` + motion primitives + reduced-motion; `design-system` skill +
  `.claude/rules/ui.md`.
- **M2 — App shell:** sidebar, mobile bottom nav (sliding pill, safe-area, FAB spring), header, page
  transitions.
- **M3 — Dashboard.**
- **M4 — Expenses list + add/edit bottom-sheet flow + swipe-to-delete.**
- **M5 — Categories / Members / Households / Settings grids.**
- **M6 — Login + empty states + polish; e2e for the key flows; a11y + reduced-motion pass.**

## 10. Definition of done

- `pnpm build`, `pnpm typecheck`, `pnpm lint` (Biome), `pnpm test`, `pnpm test:e2e` all green; CI green.
- No hardcoded color/radius/shadow values in components (token utilities only).
- Light **and** dark themes both polished; theme toggle works; no flash.
- `prefers-reduced-motion` fully respected (motion degrades, app stays usable).
- Mobile: bottom nav clears the home indicator (safe-area), all targets ≥44px, forms are bottom sheets,
  no horizontal overflow at 390px.
- Headings render in Plus Jakarta Sans (font bug gone); money is tabular.
- New-user (empty) state looks intentional on every screen.
- Mobile Lighthouse: Performance and Accessibility ≥ 90 on the dashboard.

## 11. Risks & mitigations

- **Motion bundle/perf:** keep `motion` usage in small client components; lazy where possible; verify
  Lighthouse. Reduced-motion path avoids work.
- **Biome mid-redesign churn:** done first, isolated commit.
- **e2e + libSQL in CI:** use a temp file DB + passcode auth; seed in global setup; never touch prod.
- **Base UI vs bottom-sheet:** use the existing Sheet (`side="bottom"`) for mobile forms rather than a
  new dependency; only add one if Sheet can't host the shared-element morph cleanly.
- **Dark-mode parity drift:** token-only styling makes dark mostly free; spot-check each surface.

## 12. Open questions

- None blocking. Final token values (exact OKLCH for cream/indigo, shadow depths) are tuned during M1
  against the approved mockup; the design intent is locked.
