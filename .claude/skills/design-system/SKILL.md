---
name: design-system
description: Fresh Ledger design system for Outlay — token names, type scale, motion rules, and voice. Use BEFORE any visual/restyle work on components or pages so styling stays token-only, consistent, and accessible.
---

# Fresh Ledger Design System

Outlay's visual language. Read this before restyling any component or page.
Every utility named here is verified against `src/app/globals.css` and the
primitives in `src/components/motion/` — document and use only what exists.

## Core rules (non-negotiable)
- **Token-only styling.** Never hardcode a color, radius, or shadow. Use the
  semantic tokens / Tailwind utilities below. No raw hex, `rgb()`, `hsl()`,
  `px` radii, or inline `box-shadow` in components.
- **Compose with `cva` + `cn`.** Variants are declared with `class-variance-authority`;
  merge classes with `cn` from `@/lib/utils`. Do not concatenate class strings by hand.
- **Do not fork shadcn.** Files in `src/components/ui/` are CLI-generated. Restyle by
  wrapping/composing or by editing tokens, not by rewriting primitives.
- **Respect reduced motion.** Every animation must no-op under `useReducedMotion()`.
- **Targets ≥ 44px.** Interactive elements meet a 44×44px minimum hit area.
- **Honor safe areas.** Use `env(safe-area-inset-bottom)` / safe-area utilities for
  fixed or edge-anchored UI on mobile.

## Color tokens (semantic)
Defined in `src/app/globals.css` (light `:root`, dark `.dark`) and exposed as
Tailwind color utilities via `@theme inline`. Use the semantic token, never a
literal color:
- Surfaces: `bg-background`, `bg-card`, `bg-popover`, `bg-muted`, `bg-secondary`
- Text: `text-foreground`, `text-muted-foreground`, `text-card-foreground`,
  `text-popover-foreground`
- Brand / action: `bg-primary` / `text-primary-foreground`,
  `bg-secondary` / `text-secondary-foreground`, `bg-accent` / `text-accent-foreground`
- Feedback: `bg-destructive` / `text-destructive` (there is no
  `destructive-foreground` token — destructive surfaces pair with light text via
  the variant's own classes, e.g. `bg-destructive text-white`)
- Lines & focus: `border-border`, `border-input`, `ring-ring`
- Charts: `--color-chart-1` … `--color-chart-5` (indigo → violet → teal → amber → rose),
  consumed by Recharts as `var(--chart-N)`. Category colors stay hard-coded in
  `src/lib/constants.ts` (`CATEGORY_COLORS`) by contract — leave them as-is.

Palette intent — light: warm cream `--background`, white `--card`, indigo
`--primary`. Dark: warm near-black `--background`, lifted slate `--card`,
brighter indigo `--primary`. Dark mode reaches parity through tokens, not
hand-tuned per-component overrides.

## Radius & elevation tokens
- **Radius** (driven by `--radius`, base `0.875rem`): `rounded-sm`, `rounded-md`,
  `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-3xl`, `rounded-4xl`.
  Inputs/pills sit around `rounded-lg`; cards and large surfaces use the friendlier
  `rounded-2xl` / `rounded-3xl`. No literal pixel radii.
- **Elevation** — three custom named shadow utilities registered in `@theme`:
  - `shadow-card` — resting cards / list rows.
  - `shadow-float` — popovers, dropdowns, sheets, the FAB.
  - `shadow-pop` — modals / dialogs that sit above everything.
  Use the **named** utility (`shadow-card`), never the arbitrary
  `shadow-[var(--shadow-card)]` form, and never a custom inline shadow. The default
  Tailwind `shadow-xs|sm|md` scale exists but the Fresh Ledger surfaces use the
  three named tokens above.

## Type scale
- Headings render in **Plus Jakarta Sans** automatically (`h1`–`h6` are wired to
  `--font-display` in `globals.css`). Reach for `font-display` only when you need
  the display face on a non-heading element.
- Body text is **Geist** via `font-sans` (the default on `<body>`); mono is `font-mono`.
- Suggested ramp:
  - Display / page title: `text-3xl font-semibold tracking-tight`
  - Section heading: `text-xl font-semibold`
  - Card title: `text-base font-medium`
  - Body: `text-sm`
  - Meta / caption: `text-xs text-muted-foreground`
- **Money / numeric:** pair the value with `tabular-nums` (Tailwind's built-in
  utility) so figures are equal-width and align in columns. `AnimatedNumber`
  already applies `tabular-nums`.

## Motion rules
- Import from `motion/react` (never `framer-motion`).
- Reuse the primitives in `src/components/motion/` (barrel: `@/components/motion`):
  - `PageTransition` — wrap page content for an entrance fade/slide.
  - `Stagger` + `StaggerItem` — staggered list/grid entrances.
  - `MotionCard` — card with entrance fade plus hover-lift / tap-press; forwards
    extra `motion` props (e.g. `layoutId`).
  - `AnimatedNumber({ value, format, className })` — spring count-up for money/stats;
    pass a `format` fn (e.g. a currency formatter).
- Standard easing `[0.22, 1, 0.36, 1]`; durations 0.18–0.24s. Keep it subtle.
- **Every primitive already no-ops under `useReducedMotion()`** (it renders a plain
  wrapper / final value). Never add bespoke animation that ignores reduced motion.
- Exception: shell chrome (FAB, active-tab pill) may use inline `motion` for
  `layoutId` shared-element transitions — that is expected. Everywhere else, reuse
  the primitives instead of hand-rolling `motion.div` variants.

## Voice
- Friendly and plain. Write like a helpful housemate, not a bank.
- Short sentences. Concrete nouns. Avoid jargon.
- Minimal exclamation marks — at most one per surface, usually zero.
- Examples:
  - Empty state: "No expenses yet. Add your first one to get started."
  - Confirmation: "Saved." (not "Successfully saved your expense!!!")
  - Error: "That amount doesn't look right. Try a number like 12.50."

## Restyle workflow
1. **Identify the surface** and read the current component(s); note which shadcn
   primitives are in use.
2. **Map to tokens.** Replace any literal color/radius/shadow with the semantic
   tokens above (`bg-card`, `rounded-2xl`, `shadow-card`, …).
3. **Express variants with `cva`**, merge with `cn`. Keep data/actions untouched —
   presentation and interaction only; do not change queries, Server Actions, or
   the props a component receives.
4. **Apply the type scale**; add `tabular-nums` to money/numeric figures.
5. **Layer motion** using the `src/components/motion/` primitives only.
6. **Check a11y:** ≥44px targets, visible `ring-ring` focus, safe-area on fixed UI,
   AA contrast in both themes.
7. **Verify visually:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, then
   screenshot at desktop 1440×900 and mobile 390×844 in light AND dark, and eyeball
   spacing, contrast, and motion (including with OS reduced-motion on).
