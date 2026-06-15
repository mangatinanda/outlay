# Redesign M1 — Design Foundation (fonts · tokens · motion · DS skill)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the Fresh Ledger foundation everything else builds on: fix the font bug + add Plus Jakarta Sans, replace the grayscale palette with warm light+dark tokens, add the reusable Motion primitives, and codify the design system.

**Architecture:** globals.css gains the warm OKLCH palette + shadow/font-display tokens (light+dark via existing @theme pattern); layout.tsx wires the fonts; src/components/motion/ provides the four reduced-motion-aware primitives; a design-system skill + ui rule keep future work on-brand.

**Tech Stack:** Tailwind v4, next/font/google (Plus Jakarta Sans + Geist), motion (motion/react), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`

---

## Conventions (canonical — read first)

- **Branch:** do all redesign work on a single `redesign/fresh-ledger` branch off `main` (not per-task branches). Commit after each green checkpoint.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the repo's established trailer).
- **Token utilities (Tailwind v4, defined in `src/app/globals.css` @theme):** use the NAMED utilities `shadow-card` / `shadow-float` / `shadow-pop` and `font-display` — not arbitrary `shadow-[var(--shadow-card)]` forms. Color via `bg-background`/`bg-card`/`bg-primary`/`text-foreground`/`text-muted-foreground`/`border-border`; radius via `rounded-2xl`/`rounded-3xl`; money via `tabular-nums`. No hardcoded hex/rgb/box-shadow in components.
- **Motion primitives (`src/components/motion/`, import from `motion/react`):** `PageTransition`, `AnimatedNumber({value, format, className})`, `Stagger` / `StaggerItem`, `MotionCard`. All honor `useReducedMotion()`. Reuse them — do not hand-roll bespoke `motion.div` variants on surfaces (shell chrome like the FAB/pill may use inline `motion` for layoutId, which is expected).
- **Invariants:** do NOT change `src/lib/queries/*` or `src/lib/actions/*` behavior/signatures or the props components receive — presentation + interaction only. next-themes stays; dark mode reaches parity via tokens. Restyle `src/components/ui/*` (Base UI/shadcn) via classes — do not fork. cva + `cn` for every component. lucide per-icon imports. Mobile: `env(safe-area-inset-bottom)`, ≥44px targets, no overflow at 390px. Respect `prefers-reduced-motion`; keep focus-visible rings; AA contrast.
- **Verification:** logic → vitest TDD; purely-visual → `pnpm exec tsc --noEmit` + `pnpm lint` + `pnpm build` + chrome-devtools screenshots at 1440×900 and 390×844 in light AND dark. Flows → `pnpm test:e2e`.
- **Sequencing:** this is **M1** — requires M0 (Biome) merged so new files are linted with Biome. M2–M6 (plans 03/04/05) hard-depend on this plan's tokens + motion primitives existing; do not start them until M1 is merged.
- **globals.css is edited here only** for the token/font layer; later sections that append a `@layer utilities` block must append-once and not duplicate token definitions.
---

## Fonts (fix bug + Plus Jakarta) and Fresh Ledger tokens

This section fixes the broken sans-font wiring (which causes headings/body to fall back to serif), introduces **Plus Jakarta Sans** as the display/heading face, and replaces the grayscale theme with the **Fresh Ledger** OKLCH palette plus shadow tokens (`shadow-card`/`shadow-float`/`shadow-pop`), a friendlier radius base, and retuned charts. It is almost entirely visual, so verification is `tsc` + `lint` + `build` + Chrome DevTools screenshots in light and dark at desktop (1440x900) and mobile (390x844).

**Root cause confirmed against the live files:** `src/app/layout.tsx` creates the Geist loader with `variable: "--font-geist-sans"` (line 8), but `src/app/globals.css` line 10 declares `--font-sans: var(--font-sans)` — a self-reference that resolves to nothing, so `font-sans` is empty and the cascade falls back to serif. (`--font-mono: var(--font-geist-mono)` on line 11 currently *does* resolve correctly, but we rename it for consistency.) The canonical Next.js + Tailwind v4 fix (verified in the Next.js font docs) is: give each `next/font` loader a **distinct** variable name (`--font-geist-sans`, `--font-geist-mono`, `--font-jakarta`) and map the Tailwind tokens to those distinct names inside `@theme inline` (`--font-sans: var(--font-geist-sans)`, etc.). Never set a loader's `variable` to the same name as the Tailwind token it feeds.

### Task 1: Fix font wiring and add Plus Jakarta Sans + tabular money support in layout

- [ ] **Step 1: Read the current layout to confirm the broken wiring.**
  Files: Read `src/app/layout.tsx:1-57`
  Confirm line 8 (`variable: "--font-geist-sans"`) and line 13 (`variable: "--font-geist-mono"`), the `themeColor` hexes (lines 33-34: `#ffffff` / `#0a0a0a`), and that font variables are applied on `<body>` (line 48). We will add a third loader (Plus Jakarta Sans), keep distinct loader variable names, and update the `themeColor` hexes to match the new theme.

- [ ] **Step 2: Replace the font imports, loaders, themeColor, and body class in `src/app/layout.tsx`.**
  Files: Modify `src/app/layout.tsx` (replace the entire file)
  Replace the entire file contents with:

```tsx
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "Outlay - Track Your Household Spending",
    template: "%s | Outlay",
  },
  description: "A collaborative household expense tracker for all family members",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Outlay",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#161412" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} antialiased`}
      >
        <SerwistProvider swUrl="/serwist/sw.js">
          <Providers>{children}</Providers>
        </SerwistProvider>
      </body>
    </html>
  );
}
```

Notes:
- The three loader variables stay **distinct** (`--font-geist-sans`, `--font-geist-mono`, `--font-jakarta`). The Tailwind tokens (`--font-sans`/`--font-mono`/`--font-display`) are mapped to these in the next task's `@theme inline` block. This is what actually fixes the serif fallback.
- The `themeColor` hexes are updated to the new warm cream (`#faf7f2`, the sRGB equivalent of the light `--background`) and warm near-black (`#161412`, the sRGB equivalent of the dark `--background`) so the PWA status bar matches the theme.
- `display: "swap"` is added to all three loaders for FOUT control.

- [ ] **Step 3: Run the type check.**
  Command: `pnpm exec tsc --noEmit`
  Expected output: completes with no errors (exit code 0, no output).

### Task 2: Replace grayscale theme with Fresh Ledger OKLCH palette, shadows, radius, and charts

- [ ] **Step 4: Read the current `globals.css` to confirm the structure.**
  Files: Read `src/app/globals.css:1-129`
  Confirm the `@theme inline` block (lines 7-48), `:root` (50-83), `.dark` (85-117), and `@layer base` (119-129). The current `@theme` lines 10-11 are `--font-sans: var(--font-sans)` (the broken self-reference) and `--font-mono: var(--font-geist-mono)`. We rewrite the font/shadow mappings in `@theme`, both palette blocks, and the `@layer base` block.

- [ ] **Step 5: Rewrite the `@theme inline` block in `src/app/globals.css`.**
  Files: Modify `src/app/globals.css:7-48`
  Replace lines 7-48 (the entire `@theme inline { ... }` block) with the block below. This maps `--font-sans`/`--font-mono`/`--font-display` to the distinct loader variables from the layout (fixing the serif fallback), registers the three shadow tokens so `shadow-card`/`shadow-float`/`shadow-pop` utilities exist, and bumps the radius scale to a friendlier base:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-jakarta);
  --shadow-card: var(--shadow-card);
  --shadow-float: var(--shadow-float);
  --shadow-pop: var(--shadow-pop);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
}
```

- [ ] **Step 6: Rewrite the `:root` (light) palette in `src/app/globals.css`.**
  Files: Modify `src/app/globals.css:50-83`
  Replace lines 50-83 (the entire `:root { ... }` block) with the Fresh Ledger light palette: warm cream background, white cards, indigo primary, friendlier `--radius`, three shadow definitions, and indigo/violet + category-tuned charts:

```css
:root {
  --background: oklch(0.974 0.008 85);
  --foreground: oklch(0.235 0.012 60);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.235 0.012 60);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.235 0.012 60);
  --primary: oklch(0.555 0.215 274);
  --primary-foreground: oklch(0.985 0.005 274);
  --secondary: oklch(0.955 0.012 80);
  --secondary-foreground: oklch(0.305 0.018 274);
  --muted: oklch(0.955 0.012 80);
  --muted-foreground: oklch(0.525 0.018 65);
  --accent: oklch(0.945 0.025 274);
  --accent-foreground: oklch(0.405 0.13 274);
  --destructive: oklch(0.585 0.22 27);
  --border: oklch(0.905 0.012 80);
  --input: oklch(0.905 0.012 80);
  --ring: oklch(0.555 0.215 274);
  --chart-1: oklch(0.555 0.215 274);
  --chart-2: oklch(0.62 0.2 300);
  --chart-3: oklch(0.7 0.16 200);
  --chart-4: oklch(0.74 0.17 75);
  --chart-5: oklch(0.66 0.2 12);
  --radius: 0.875rem;
  --shadow-card: 0 1px 2px oklch(0.235 0.012 60 / 0.04), 0 4px 12px oklch(0.235 0.012 60 / 0.05);
  --shadow-float: 0 4px 8px oklch(0.235 0.012 60 / 0.05), 0 12px 28px oklch(0.235 0.012 60 / 0.08);
  --shadow-pop: 0 8px 16px oklch(0.235 0.012 60 / 0.08), 0 24px 48px oklch(0.235 0.012 60 / 0.12);
  --sidebar: oklch(0.985 0.006 85);
  --sidebar-foreground: oklch(0.235 0.012 60);
  --sidebar-primary: oklch(0.555 0.215 274);
  --sidebar-primary-foreground: oklch(0.985 0.005 274);
  --sidebar-accent: oklch(0.945 0.025 274);
  --sidebar-accent-foreground: oklch(0.405 0.13 274);
  --sidebar-border: oklch(0.905 0.012 80);
  --sidebar-ring: oklch(0.555 0.215 274);
}
```

- [ ] **Step 7: Rewrite the `.dark` palette in `src/app/globals.css`.**
  Files: Modify `src/app/globals.css:85-117`
  Replace lines 85-117 (the entire `.dark { ... }` block) with the Fresh Ledger dark palette: warm near-black background, lifted slate cards, brighter indigo primary, deeper shadows, and matching charts:

```css
.dark {
  --background: oklch(0.18 0.008 70);
  --foreground: oklch(0.955 0.006 85);
  --card: oklch(0.235 0.01 70);
  --card-foreground: oklch(0.955 0.006 85);
  --popover: oklch(0.235 0.01 70);
  --popover-foreground: oklch(0.955 0.006 85);
  --primary: oklch(0.685 0.18 274);
  --primary-foreground: oklch(0.185 0.04 274);
  --secondary: oklch(0.295 0.012 70);
  --secondary-foreground: oklch(0.955 0.006 85);
  --muted: oklch(0.295 0.012 70);
  --muted-foreground: oklch(0.715 0.014 75);
  --accent: oklch(0.33 0.05 274);
  --accent-foreground: oklch(0.9 0.05 274);
  --destructive: oklch(0.7 0.19 22);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.685 0.18 274);
  --chart-1: oklch(0.685 0.18 274);
  --chart-2: oklch(0.72 0.17 300);
  --chart-3: oklch(0.75 0.15 200);
  --chart-4: oklch(0.78 0.16 75);
  --chart-5: oklch(0.71 0.18 12);
  --shadow-card: 0 1px 2px oklch(0 0 0 / 0.2), 0 4px 12px oklch(0 0 0 / 0.3);
  --shadow-float: 0 4px 8px oklch(0 0 0 / 0.3), 0 12px 28px oklch(0 0 0 / 0.45);
  --shadow-pop: 0 8px 16px oklch(0 0 0 / 0.4), 0 24px 48px oklch(0 0 0 / 0.55);
  --sidebar: oklch(0.235 0.01 70);
  --sidebar-foreground: oklch(0.955 0.006 85);
  --sidebar-primary: oklch(0.685 0.18 274);
  --sidebar-primary-foreground: oklch(0.185 0.04 274);
  --sidebar-accent: oklch(0.33 0.05 274);
  --sidebar-accent-foreground: oklch(0.9 0.05 274);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.685 0.18 274);
}
```

- [ ] **Step 8: Add display-font headings in the `@layer base` block.**
  Files: Modify `src/app/globals.css:119-129`
  Replace lines 119-129 (the entire `@layer base { ... }` block) with the block below. This makes all `h1`–`h6` render in Plus Jakarta Sans (`--font-display`) with a tighter heading tracking, and keeps the body on Geist sans:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-sans;
  }
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-family: var(--font-display), var(--font-sans), ui-sans-serif, system-ui, sans-serif;
    letter-spacing: -0.02em;
  }
}
```

Notes:
- The original block applied `font-sans` to `html`; we move it to `body` so it sits on the same element that carries the `next/font` variables (the variables are declared on `<body>` in `layout.tsx`). This guarantees `font-sans` resolves to the loaded Geist face rather than inheriting an unset value.
- **Do NOT define a custom `.tabular-nums` class here.** Tailwind v4 already ships a `tabular-nums` utility (`font-variant-numeric: tabular-nums`). Redefining it is redundant and could shadow the built-in. Money columns get tabular figures by applying the existing `tabular-nums` utility in the currency/amount components — that wiring lives in the component sections, not in this file. (See cross-section note below.)
- `src/lib/constants.ts` `CATEGORY_COLORS` and `CATEGORY_ICONS` are intentionally left **UNCHANGED** — category colors stay hard-coded hex per the contract.

- [ ] **Step 9: Run the type check.**
  Command: `pnpm exec tsc --noEmit`
  Expected output: completes with no errors (exit code 0, no output).

- [ ] **Step 10: Run the linter.**
  Command: `pnpm lint`
  Expected output: completes with exit code 0; no errors. (`pnpm lint` runs `eslint`; CSS/token changes should produce no new lint findings.)

- [ ] **Step 11: Run the production build to confirm Tailwind compiles the new tokens and utilities.**
  Command: `pnpm build`
  Expected output: build completes successfully and prints the route table; no CSS, font, or PostCSS errors. Confirms `shadow-card`/`shadow-float`/`shadow-pop` and `font-display` utilities resolve and the `@theme` font mappings compile.

- [ ] **Step 12: Start the dev server in the background for visual verification.**
  Command: `pnpm dev` — run with `run_in_background: true` (do NOT run it in the foreground; it never exits and will block the session).
  Then poll until ready (Monitor / until-loop on the log) for the "Ready" line and local URL (typically `http://localhost:3000`). Leave running for the screenshot steps; stop it after Step 16.

> Verification rationale: this section is a **purely visual** change (fonts + color tokens + shadows + radius). There is no business logic to unit-test, so the verification is `tsc` + `lint` + `build` (Steps 9-11) plus the Chrome DevTools screenshots below at desktop 1440x900 and mobile 390x844 in both light and dark. Dark mode is driven by `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`, default `storageKey: "theme"`), so we force the theme via `localStorage` + reload rather than toggling the `.dark` class directly (next-themes would re-sync and revert a bare class toggle).

- [ ] **Step 13: Screenshot the dashboard in LIGHT mode at desktop 1440x900.**
  Tooling: chrome-devtools — `mcp__chrome-devtools__resize_page` to width 1440, height 900; `mcp__chrome-devtools__navigate_page` to `http://localhost:3000`; force light theme with `mcp__chrome-devtools__evaluate_script` running `localStorage.setItem('theme','light')` then `mcp__chrome-devtools__navigate_page` to reload `http://localhost:3000`; `mcp__chrome-devtools__take_screenshot`.
  Eyeball checklist:
  - [ ] Background is warm cream (not pure white/gray); cards are white and sit on the cream with a soft `shadow-card`.
  - [ ] Primary buttons/links are indigo.
  - [ ] Headings render in **Plus Jakarta Sans** (geometric humanist sans), **NOT a serif**.
  - [ ] Money amounts use tabular (equal-width) figures and align in columns.
  - [ ] Corners look friendlier/rounder than before.

- [ ] **Step 14: Screenshot the dashboard in DARK mode at desktop 1440x900.**
  Tooling: chrome-devtools — keep 1440x900; force dark theme via `mcp__chrome-devtools__evaluate_script` running `localStorage.setItem('theme','dark')`, then `mcp__chrome-devtools__navigate_page` to reload `http://localhost:3000` (so next-themes applies `.dark` on mount); `mcp__chrome-devtools__take_screenshot`.
  Eyeball checklist:
  - [ ] Background is warm near-black (slightly brown-warm, not pure neutral); cards are a lifted slate, clearly distinct from the background.
  - [ ] Primary is a brighter indigo, readable on the dark card.
  - [ ] Headings still render in Plus Jakarta Sans (not serif); money still tabular.

- [ ] **Step 15: Screenshot the dashboard in LIGHT mode at mobile 390x844.**
  Tooling: chrome-devtools — `mcp__chrome-devtools__resize_page` to width 390, height 844; force light theme via `mcp__chrome-devtools__evaluate_script` running `localStorage.setItem('theme','light')`, then `mcp__chrome-devtools__navigate_page` to reload `http://localhost:3000`; `mcp__chrome-devtools__take_screenshot`.
  Eyeball checklist:
  - [ ] Cream background, white cards, indigo primary, Plus Jakarta headings, tabular money all hold at mobile width.
  - [ ] No horizontal overflow; safe-area padding intact.

- [ ] **Step 16: Screenshot the dashboard in DARK mode at mobile 390x844.**
  Tooling: chrome-devtools — keep 390x844; force dark theme via `mcp__chrome-devtools__evaluate_script` running `localStorage.setItem('theme','dark')`, then `mcp__chrome-devtools__navigate_page` to reload `http://localhost:3000`; `mcp__chrome-devtools__take_screenshot`.
  Eyeball checklist:
  - [ ] Warm near-black background, lifted slate cards, brighter indigo, Plus Jakarta headings, tabular money all hold.

- [ ] **Step 17: Commit the font fix and Fresh Ledger tokens (only if the user has asked to commit).**
  The repo's current branch is `main` (the default branch). Per repo policy, do **not** commit directly to the default branch and only commit when the user asks. If committing is requested, branch first, then commit:
  Command:
```
git checkout -b redesign/fresh-ledger-tokens 2>/dev/null || git checkout redesign/fresh-ledger-tokens
git add src/app/layout.tsx src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(theme): fix sans-font wiring, add Plus Jakarta Sans, apply Fresh Ledger OKLCH palette

- Give each next/font loader a distinct variable (--font-geist-sans/--font-geist-mono/--font-jakarta) and map Tailwind tokens to them in @theme (headings/body were falling back to serif due to a self-referential --font-sans)
- Add Plus Jakarta Sans as the display/heading face (h1-h6 via --font-display)
- Replace grayscale palette with Fresh Ledger OKLCH (light: warm cream/white cards/indigo; dark: warm near-black/lifted slate/indigo)
- Add --shadow-card/--shadow-float/--shadow-pop @theme tokens
- Bump --radius base for a friendlier look; retune --chart-* to indigo/violet + category palette
- Update PWA themeColor hexes to match the new backgrounds

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```
  Expected output: a new branch is created/checked out and one commit is created listing 2 files changed.

### Critical Files for Implementation
- /Users/nanda/vibe-code/outlay/src/app/layout.tsx
- /Users/nanda/vibe-code/outlay/src/app/globals.css
- /Users/nanda/vibe-code/outlay/src/lib/constants.ts (read-only; left unchanged)

## Motion primitives + design-system skill and UI rules

This section adds the `motion` dependency, four motion primitives (all reduced-motion-aware) plus a barrel export, a DOM-capable Vitest path for the `AnimatedNumber` unit test, and the design-system skill plus path-scoped UI rules.

The repo currently has `vitest.config.ts` with `environment: "node"` and `include: ["src/**/*.test.ts"]` (no `.tsx`); existing tests under `src/lib/**` and `src/components/shared/currency-display.test.ts` are pure-function tests with no DOM rendering, so introducing `setupFiles` is non-breaking for them. There is no `src/components/motion/` directory and no `.claude/rules/` directory yet.

### Task 3: Add the motion dependency

- [ ] **Step 1: Install `motion` as an exact-pinned runtime dependency.**
  Resolve the latest stable from the registry, pinned exact (do NOT hardcode a version string):
  ```bash
  pnpm add --save-exact motion
  ```
  Expected output: pnpm reports `+ motion <version>` added to `dependencies`, and `package.json` shows a non-caret entry like `"motion": "12.x.y"` (exact, no `^`). Lockfile updates with no peer-dependency errors.

- [ ] **Step 2: Verify the `motion/react` subpath import resolves (contract: import from `motion/react`).**
  `motion/react` is an exports-map subpath, so verify with an ESM dynamic import rather than CJS `require.resolve`:
  ```bash
  pnpm ls motion && node --input-type=module -e "await import('motion/react'); console.log('ok')"
  ```
  Expected output: `pnpm ls` lists the installed `motion` version, then `ok` prints with no `ERR_MODULE_NOT_FOUND` / `ERR_PACKAGE_PATH_NOT_EXPORTED`.

- [ ] **Step 3: Commit the dependency.**
  ```bash
  git add package.json pnpm-lock.yaml && git commit -m "build: add motion dependency (exact-pinned)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit created listing `package.json` and `pnpm-lock.yaml`.

### Task 4: Set up a DOM test environment for component tests

The repo's `vitest.config.ts` uses `environment: "node"`, which has no DOM. The `AnimatedNumber` test needs DOM. We use a **per-file pragma** (`// @vitest-environment happy-dom`) rather than a Vitest projects split, so the node default stays for all existing pure-function tests and only DOM-needing files opt in. We also add a setup file so `@testing-library/jest-dom` matchers (e.g. `toBeInTheDocument`) and auto-cleanup are available.

- [ ] **Step 1: Install the DOM test toolchain as exact dev dependencies.**
  Resolve the latest stable, pinned exact (do NOT hardcode versions):
  ```bash
  pnpm add -D --save-exact @testing-library/react @testing-library/jest-dom happy-dom
  ```
  Expected output: three `+` lines under `devDependencies`, each with an exact (no `^`) version.

- [ ] **Step 2: Create the Vitest setup file.**
  Create `vitest.setup.ts` with full contents:
  ```ts
  import "@testing-library/jest-dom/vitest";
  import { cleanup } from "@testing-library/react";
  import { afterEach } from "vitest";

  afterEach(() => {
    cleanup();
  });
  ```
  Files: Create `vitest.setup.ts`.

- [ ] **Step 3: Wire the setup file and broaden test include to `.tsx`.**
  Replace the entire contents of `vitest.config.ts` to register `setupFiles` and allow component test files (the existing file is 12 lines: a node-env config with the `@` alias):
  ```ts
  import { defineConfig } from "vitest/config";
  import path from "node:path";

  export default defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
      setupFiles: ["./vitest.setup.ts"],
    },
    resolve: {
      // Mirror the `@/*` path alias from tsconfig.json.
      alias: { "@": path.resolve(__dirname, "src") },
    },
  });
  ```
  Files: Modify `vitest.config.ts` (full-file replacement).

- [ ] **Step 4: Confirm the existing node-env suite still passes (no regressions from the setup file).**
  ```bash
  pnpm test
  ```
  Expected output: the existing pure-function suites (`src/lib/**`, `src/components/shared/currency-display.test.ts`) run and pass; no errors about missing DOM globals in node-env files (the `jest-dom/vitest` import only attaches matchers and does not require a DOM until a test actually renders into one).

- [ ] **Step 5: Commit the test environment setup.**
  ```bash
  git add vitest.config.ts vitest.setup.ts package.json pnpm-lock.yaml && git commit -m "test: add happy-dom + testing-library for component tests

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit listing the four files.

### Task 5: Create the PageTransition primitive

- [ ] **Step 1: Create `page-transition.tsx`.**
  Wraps children in a fade/slide that is disabled under reduced motion (renders a plain wrapper, no animation props). Full file:
  ```tsx
  "use client";

  import { motion, useReducedMotion } from "motion/react";
  import { cn } from "@/lib/utils";

  export interface PageTransitionProps {
    children: React.ReactNode;
    className?: string;
  }

  export function PageTransition({ children, className }: PageTransitionProps) {
    const reduce = useReducedMotion();

    if (reduce) {
      return <div className={cn(className)}>{children}</div>;
    }

    return (
      <motion.div
        className={cn(className)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    );
  }
  ```
  Files: Create `src/components/motion/page-transition.tsx`.

### Task 6: Create the Stagger primitives

- [ ] **Step 1: Create `stagger.tsx` with `Stagger` and `StaggerItem`.**
  Parent orchestrates child entrance; under reduced motion both render plain wrappers with no variants. Full file:
  ```tsx
  "use client";

  import { motion, useReducedMotion, type Variants } from "motion/react";
  import { cn } from "@/lib/utils";

  const containerVariants: Variants = {
    hidden: {},
    show: {
      transition: { staggerChildren: 0.06, delayChildren: 0.04 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
    },
  };

  export interface StaggerProps {
    children: React.ReactNode;
    className?: string;
  }

  export function Stagger({ children, className }: StaggerProps) {
    const reduce = useReducedMotion();

    if (reduce) {
      return <div className={cn(className)}>{children}</div>;
    }

    return (
      <motion.div
        className={cn(className)}
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {children}
      </motion.div>
    );
  }

  export interface StaggerItemProps {
    children: React.ReactNode;
    className?: string;
  }

  export function StaggerItem({ children, className }: StaggerItemProps) {
    const reduce = useReducedMotion();

    if (reduce) {
      return <div className={cn(className)}>{children}</div>;
    }

    return (
      <motion.div className={cn(className)} variants={itemVariants}>
        {children}
      </motion.div>
    );
  }
  ```
  Files: Create `src/components/motion/stagger.tsx`.

### Task 7: Create the MotionCard primitive

- [ ] **Step 1: Create `motion-card.tsx`.**
  A hover/tap lift wrapper; under reduced motion it renders a plain wrapper with no `whileHover`/`whileTap`. Full file:
  ```tsx
  "use client";

  import { motion, useReducedMotion } from "motion/react";
  import { cn } from "@/lib/utils";

  export interface MotionCardProps {
    children: React.ReactNode;
    className?: string;
  }

  export function MotionCard({ children, className }: MotionCardProps) {
    const reduce = useReducedMotion();

    if (reduce) {
      return <div className={cn(className)}>{children}</div>;
    }

    return (
      <motion.div
        className={cn(className)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    );
  }
  ```
  Files: Create `src/components/motion/motion-card.tsx`.

### Task 8: Create the AnimatedNumber primitive (TDD)

`AnimatedNumber` takes a numeric `value` and a `format` fn, and animates the displayed number toward `value`. Under reduced motion it must render the formatted final value immediately. We test both behaviors first.

- [ ] **Step 1: Write the failing test.**
  Create `src/components/motion/animated-number.test.tsx` (the `// @vitest-environment happy-dom` pragma on line 1 opts this single file into a DOM env; all other suites stay node-env):
  ```tsx
  // @vitest-environment happy-dom
  import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
  import { render, screen } from "@testing-library/react";

  const useReducedMotionMock = vi.fn<() => boolean>();

  vi.mock("motion/react", async () => {
    const actual =
      await vi.importActual<typeof import("motion/react")>("motion/react");
    return {
      ...actual,
      useReducedMotion: () => useReducedMotionMock(),
    };
  });

  import { AnimatedNumber } from "./animated-number";

  const usd = (n: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);

  describe("AnimatedNumber", () => {
    beforeEach(() => {
      useReducedMotionMock.mockReset();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("renders the formatted final value immediately under reduced motion", () => {
      useReducedMotionMock.mockReturnValue(true);
      render(<AnimatedNumber value={1234} format={usd} />);
      expect(screen.getByText("$1,234")).toBeInTheDocument();
    });

    it("formats via the provided format fn (uses format, not raw value)", () => {
      useReducedMotionMock.mockReturnValue(true);
      render(<AnimatedNumber value={5} format={(n) => `${n} pts`} />);
      expect(screen.getByText("5 pts")).toBeInTheDocument();
      expect(screen.queryByText("5")).not.toBeInTheDocument();
    });
  });
  ```
  Files: Create `src/components/motion/animated-number.test.tsx`.

- [ ] **Step 2: Run the test and watch it fail (module does not exist yet).**
  ```bash
  pnpm exec vitest run src/components/motion/animated-number.test.tsx
  ```
  Expected output: failure — `Failed to resolve import "./animated-number"` (or "Cannot find module"). Confirms the test is wired and red.

- [ ] **Step 3: Write the minimal `AnimatedNumber` implementation.**
  Create `src/components/motion/animated-number.tsx`. Under reduced motion it returns the formatted value directly; otherwise it animates a spring-driven motion value and renders the formatted, transformed value as the child of `motion.span`. Full file:
  ```tsx
  "use client";

  import { useEffect } from "react";
  import {
    motion,
    useMotionValue,
    useReducedMotion,
    useSpring,
    useTransform,
  } from "motion/react";
  import { cn } from "@/lib/utils";

  export interface AnimatedNumberProps {
    value: number;
    format: (value: number) => string;
    className?: string;
  }

  export function AnimatedNumber({
    value,
    format,
    className,
  }: AnimatedNumberProps) {
    const reduce = useReducedMotion();

    const source = useMotionValue(value);
    const spring = useSpring(source, { stiffness: 120, damping: 24, mass: 0.6 });
    const display = useTransform(spring, (latest) => format(latest));

    useEffect(() => {
      source.set(value);
    }, [source, value]);

    if (reduce) {
      return (
        <span className={cn("tabular-nums", className)}>{format(value)}</span>
      );
    }

    return (
      <motion.span className={cn("tabular-nums", className)}>
        {display}
      </motion.span>
    );
  }
  ```
  Files: Create `src/components/motion/animated-number.tsx`.

- [ ] **Step 4: Run the test and watch it pass.**
  ```bash
  pnpm exec vitest run src/components/motion/animated-number.test.tsx
  ```
  Expected output: `2 passed` — both the reduced-motion final-value test and the format-fn test are green.

- [ ] **Step 5: Commit the AnimatedNumber primitive and its test.**
  ```bash
  git add src/components/motion/animated-number.tsx src/components/motion/animated-number.test.tsx && git commit -m "feat(motion): add AnimatedNumber primitive with reduced-motion support

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit listing the two files.

### Task 9: Create the motion barrel export and verify the suite

- [ ] **Step 1: Create `index.ts` re-exporting every primitive and its props type.**
  Full file:
  ```ts
  export { PageTransition, type PageTransitionProps } from "./page-transition";
  export {
    AnimatedNumber,
    type AnimatedNumberProps,
  } from "./animated-number";
  export {
    Stagger,
    StaggerItem,
    type StaggerProps,
    type StaggerItemProps,
  } from "./stagger";
  export { MotionCard, type MotionCardProps } from "./motion-card";
  ```
  Files: Create `src/components/motion/index.ts`.

- [ ] **Step 2: Typecheck the whole project.**
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors (exit 0).

- [ ] **Step 3: Lint.**
  ```bash
  pnpm lint
  ```
  Expected output: no errors or warnings for the new `src/components/motion/**` files.

- [ ] **Step 4: Run the full test suite (DOM-pragma file + node).**
  ```bash
  pnpm test
  ```
  Expected output: all suites pass, including `animated-number.test.tsx`; the happy-dom pragma stays scoped to that one file and no DOM-env errors leak into the node-env pure-function tests.

- [ ] **Step 5: Production build (the motion primitives are `"use client"` and must compile under the Next.js build).**
  ```bash
  pnpm build
  ```
  Expected output: build succeeds (exit 0) with no errors about `motion/react` imports, client-boundary violations, or unused symbols in `src/components/motion/**`.

- [ ] **Step 6: Commit the remaining primitives and the barrel.**
  ```bash
  git add src/components/motion/page-transition.tsx src/components/motion/stagger.tsx src/components/motion/motion-card.tsx src/components/motion/index.ts && git commit -m "feat(motion): add PageTransition, Stagger, MotionCard primitives + barrel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit listing the four files.

### Task 10: Author the design-system skill

This skill is read by future restyle work. It is documentation only — no app code, no test.

- [ ] **Step 1: Create `.claude/skills/design-system/SKILL.md`.**
  Full file:
  ````markdown
  ---
  name: design-system
  description: Fresh Ledger design system for Outlay — token names, type scale, motion rules, and voice. Use BEFORE any visual/restyle work on components or pages so styling stays token-only, consistent, and accessible.
  ---

  # Fresh Ledger Design System

  Outlay's visual language. Read this before restyling any component or page.

  ## Core rules (non-negotiable)
  - **Token-only styling.** Never hardcode a color, radius, or shadow. Use the
    semantic tokens / Tailwind utilities below. No raw hex, `rgb()`, `px` radii,
    or inline box-shadows in components.
  - **Compose with `cva` + `cn`.** Variants are declared with `class-variance-authority`;
    merge classes with `cn` from `@/lib/utils`. Do not concatenate class strings by hand.
  - **Do not fork shadcn.** Files in `src/components/ui/` are CLI-generated. Restyle by
    wrapping/composing or by editing tokens, not by rewriting primitives.
  - **Respect reduced motion.** Every animation must no-op under `useReducedMotion()`.
  - **Targets ≥ 44px.** Interactive elements meet a 44×44px minimum hit area.
  - **Honor safe areas.** Use the safe-area utilities for fixed/edge UI on mobile.

  ## Color tokens (semantic)
  Use the semantic CSS variable tokens, never literal colors:
  - Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`
  - Text: `text-foreground`, `text-muted-foreground`, `text-card-foreground`
  - Brand/action: `bg-primary` / `text-primary-foreground`,
    `bg-secondary` / `text-secondary-foreground`, `bg-accent` / `text-accent-foreground`
  - Feedback: `bg-destructive` / `text-destructive-foreground`
  - Lines & focus: `border-border`, `ring-ring`, `bg-input`

  ## Radius & elevation tokens
  - Radius: `rounded-sm | rounded-md | rounded-lg | rounded-xl` (driven by `--radius`).
    Cards use `rounded-lg`; pills/inputs use `rounded-md`. No literal pixel radii.
  - Elevation: `shadow-xs | shadow-sm | shadow-md`. Cards rest at `shadow-sm`;
    raise to `shadow-md` on hover. No custom inline shadows.

  ## Type scale
  - Display / page title: `text-3xl font-semibold tracking-tight`
  - Section heading: `text-xl font-semibold`
  - Card title: `text-base font-medium`
  - Body: `text-sm`
  - Meta / caption: `text-xs text-muted-foreground`
  - Numeric / money: pair with `tabular-nums` so figures align.

  ## Motion rules
  - Import from `motion/react` (never `framer-motion`).
  - Use the primitives in `src/components/motion/`:
    - `PageTransition` — wrap page content for entrance fade/slide.
    - `Stagger` + `StaggerItem` — list/grid entrances.
    - `MotionCard` — hover/tap lift on cards.
    - `AnimatedNumber` — count-up for money/stats; pass a `format` fn.
  - Standard easing `[0.22, 1, 0.36, 1]`; durations 0.18–0.24s. Keep it subtle.
  - Every primitive already no-ops under reduced motion — never add bespoke
    animation that ignores `useReducedMotion()`.

  ## Voice
  - Friendly and plain. Write like a helpful housemate, not a bank.
  - Short sentences. Concrete nouns. Avoid jargon.
  - Minimal exclamation marks — at most one per surface, usually zero.
  - Examples:
    - Empty state: "No expenses yet. Add your first one to get started."
    - Confirmation: "Saved." (not "Successfully saved your expense!!!")
    - Error: "That amount doesn't look right. Try a number like 12.50."

  ## Restyle workflow
  1. **Identify the surface** and read the current component(s); note shadcn primitives in use.
  2. **Map to tokens.** Replace any literal color/radius/shadow with the semantic token above.
  3. **Express variants with `cva`**, merge with `cn`. Keep data/actions untouched —
     styling only.
  4. **Apply type scale** from this doc; add `tabular-nums` to numeric figures.
  5. **Layer motion** using the `src/components/motion/` primitives only.
  6. **Check a11y:** ≥44px targets, visible `ring-ring` focus, safe-area on fixed UI.
  7. **Verify visually:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, then
     screenshot at desktop 1440×900 and mobile 390×844 and eyeball spacing, contrast,
     and motion (including with OS reduced-motion on).
  ````
  Files: Create `.claude/skills/design-system/SKILL.md`.

- [ ] **Step 2: Commit the skill.**
  ```bash
  git add .claude/skills/design-system/SKILL.md && git commit -m "docs(skill): add Fresh Ledger design-system skill

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit listing the SKILL.md file.

### Task 11: Author the path-scoped UI rules

Documentation only — path-scoped frontmatter so the rules auto-apply when editing UI files. (There is no `.claude/rules/` directory yet; creating the file also creates the directory.)

- [ ] **Step 1: Create `.claude/rules/ui.md`.**
  Full file:
  ````markdown
  ---
  description: UI styling invariants for Outlay components and pages.
  paths:
    - src/components/**
    - src/app/**
  ---

  # UI Rules (Fresh Ledger)

  These apply to every file under `src/components/**` and `src/app/**`.
  For the full system (tokens, type scale, voice, workflow) see the
  `design-system` skill.

  ## Token-only styling
  - No hardcoded colors (no hex, `rgb()`, `hsl()` literals, or named CSS colors).
    Use semantic tokens: `bg-background`, `bg-card`, `text-foreground`,
    `text-muted-foreground`, `bg-primary`/`text-primary-foreground`,
    `bg-destructive`, `border-border`, `ring-ring`, etc.
  - No literal radii. Use `rounded-sm|md|lg|xl` (driven by `--radius`).
  - No inline/custom shadows. Use `shadow-xs|sm|md`.

  ## cva + cn idiom
  - Declare style variants with `class-variance-authority` (`cva`).
  - Always merge class names with `cn` from `@/lib/utils` — never template-string
    concatenation or manual `clsx` calls in components.

  ## Reduced motion
  - All animation must no-op under `useReducedMotion()` from `motion/react`.
  - Prefer the shared primitives in `src/components/motion/` over ad-hoc `motion.*`.
  - Import motion from `motion/react`, never `framer-motion`.

  ## Touch targets ≥ 44px
  - Interactive elements (buttons, links, icon buttons, list rows that act as
    controls) have a minimum 44×44px hit area. Add padding or `min-h`/`min-w`
    rather than shrinking below this.

  ## Do not fork shadcn
  - `src/components/ui/` is generated by the shadcn CLI. Restyle by composition
    or token changes, not by rewriting these primitives.

  ## Accessibility & safe areas
  - Preserve visible focus (`ring-ring`) and existing ARIA/labels.
  - Use safe-area utilities for fixed or edge-anchored UI on mobile.

  ## Styling only
  - These rules govern presentation. Do not change data fetching, Server Actions,
    validators, or query logic while restyling.
  ````
  Files: Create `.claude/rules/ui.md`.

- [ ] **Step 2: Commit the UI rules.**
  ```bash
  git add .claude/rules/ui.md && git commit -m "docs(rules): add path-scoped UI styling rules

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit listing the ui.md file.

### Critical Files for Implementation
- /Users/nanda/vibe-code/outlay/vitest.config.ts
- /Users/nanda/vibe-code/outlay/vitest.setup.ts
- /Users/nanda/vibe-code/outlay/package.json
- /Users/nanda/vibe-code/outlay/src/lib/utils.ts
- /Users/nanda/vibe-code/outlay/src/components/motion/page-transition.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/stagger.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/motion-card.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/animated-number.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/animated-number.test.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/index.ts
- /Users/nanda/vibe-code/outlay/.claude/skills/design-system/SKILL.md
- /Users/nanda/vibe-code/outlay/.claude/rules/ui.md
