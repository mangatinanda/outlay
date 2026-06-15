# Redesign M5+M6 — Grids, Login, Empty States, e2e & a11y

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the categories/members/households/settings grids and the login screen, add friendly empty states everywhere, then a final e2e + a11y + mobile-Lighthouse pass.

**Architecture:** Manager grids use MotionCard + Stagger; login gets the warm card treatment; a final sweep adds the switch-household isolation e2e and verifies reduced-motion, contrast, focus rings, and Lighthouse ≥90 on the dashboard.

**Tech Stack:** motion/react, Tailwind v4 tokens, Playwright, Lighthouse.

**Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`

---

## Conventions (canonical — read first)

- **Branch:** do all redesign work on a single `redesign/fresh-ledger` branch off `main` (not per-task branches). Commit after each green checkpoint.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the repo's established trailer).
- **Token utilities (Tailwind v4, defined in `src/app/globals.css` @theme):** use the NAMED utilities `shadow-card` / `shadow-float` / `shadow-pop` and `font-display` — not arbitrary `shadow-[var(--shadow-card)]` forms. Color via `bg-background`/`bg-card`/`bg-primary`/`text-foreground`/`text-muted-foreground`/`border-border`; radius via `rounded-2xl`/`rounded-3xl`; money via `tabular-nums`. No hardcoded hex/rgb/box-shadow in components.
- **Motion primitives (`src/components/motion/`, import from `motion/react`):** `PageTransition`, `AnimatedNumber({value, format, className})`, `Stagger` / `StaggerItem`, `MotionCard`. All honor `useReducedMotion()`. Reuse them — do not hand-roll bespoke `motion.div` variants on surfaces (shell chrome like the FAB/pill may use inline `motion` for layoutId, which is expected).
- **Invariants:** do NOT change `src/lib/queries/*` or `src/lib/actions/*` behavior/signatures or the props components receive — presentation + interaction only. next-themes stays; dark mode reaches parity via tokens. Restyle `src/components/ui/*` (Base UI/shadcn) via classes — do not fork. cva + `cn` for every component. lucide per-icon imports. Mobile: `env(safe-area-inset-bottom)`, ≥44px targets, no overflow at 390px. Respect `prefers-reduced-motion`; keep focus-visible rings; AA contrast.
- **Verification:** logic → vitest TDD; purely-visual → `pnpm exec tsc --noEmit` + `pnpm lint` + `pnpm build` + chrome-devtools screenshots at 1440×900 and 390×844 in light AND dark. Flows → `pnpm test:e2e`.
- **Sequencing:** **M5+M6 (last)** — requires M0–M4 merged (it audits and polishes everything prior). The switch-household isolation e2e is a *spec file only* (Playwright scaffolded in Plan 01); confirm M0's webServer sets `DATABASE_URL=file:./data/e2e.db` + `HOUSEHOLD_PASSCODE` so the e2e seed fixture fires.
- **Open token decision (from M1):** the admin Crown uses `text-amber-500` (a stock color, not a Fresh Ledger token). Either add a semantic accent token in M1 or explicitly exempt it like the Google brand SVG.
---

This section restyles the categories, members, and households card grids plus the settings cards and login screen, wires friendly empty states everywhere, then closes the redesign with a Playwright data-isolation e2e and a combined a11y / reduced-motion / Lighthouse pass.

It has hard upstream dependencies that MUST already be merged before this section starts:
- **M1 motion primitives** at `src/components/motion/`: `MotionCard` (`motion-card.tsx`), `Stagger` + `StaggerItem` (`stagger.tsx`). All three accept `className` and pass through DOM props (including `onClick`, `role`, `tabIndex`, `aria-*`, `onKeyDown`, `data-*`) and internally honor `useReducedMotion`.
- **M1 Fresh Ledger tokens** registered in `src/app/globals.css`: utilities `shadow-card`, `shadow-float`, and `font-display` (Plus Jakarta Sans), plus the warm palette (cream `--background`, warm-slate dark surfaces). `rounded-2xl`/`rounded-3xl`/`rounded-xl` are stock Tailwind.
- **M1 dashboard + expenses redesign** (the Lighthouse pass audits `/dashboard`; the expenses empty state inherits the softened `EmptyState`).
- **M0 Playwright scaffold**: `@playwright/test` installed (pinned exact), `playwright.config.ts` (Pixel-7 project, `webServer` running `pnpm start` against a built app or `next dev`, `baseURL http://localhost:3000`, seeded temp libSQL at `file:./data/e2e.db`), a `test:e2e` script in `package.json` (`"test:e2e": "playwright test"`), and a known `HOUSEHOLD_PASSCODE` env for the seeded DB.

If any of the above is missing, STOP and finish the owning milestone first — this section creates none of that scaffolding, it only consumes it. Step 0 of the e2e task below hard-fails if the scaffold is absent.

> Repo facts verified against the working tree at plan time: the seed entrypoint is `scripts/seed.ts`, which calls `seed()` exported from `src/lib/db/seed.ts` (so seed *logic* lives in `src/lib/db/seed.ts`). The current `seed()` early-returns when any household already exists. Expense rows in `src/components/expenses/expense-list.tsx` are plain `<div>` row containers (lines 73-76), not cards. The members manager already derives `formatCurrency` via `const formatCurrency = useFormatCurrency()` (from `@/components/providers/currency-provider`), so grid JSX may call `formatCurrency(...)` directly. The login page already imports `signIn` from `@/auth` and defines `GoogleIcon` inline. The auth layout (`src/app/(auth)/layout.tsx`) already centers its child on `bg-background`.

All commit trailers in this section use the mandated co-author line:
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

### Task 1: Restyle the categories grid

- [ ] **Step 1: Add motion imports.** In `src/components/categories/category-manager.tsx`, replace the line-4 card import:

```tsx
import { Card, CardContent } from "@/components/ui/card";
```

with the motion primitives (the grid no longer uses `Card`/`CardContent`, and nothing else in the file references them):

```tsx
import { MotionCard } from "@/components/motion/motion-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
```

- [ ] **Step 2: Replace the grid JSX.** Replace the entire grid block (the `<div className="grid ...">...</div>` spanning lines 90-132) with:

```tsx
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <StaggerItem key={cat.id}>
            <MotionCard className="group flex items-center gap-3 rounded-2xl bg-card p-4 shadow-card">
              <CategoryIcon icon={cat.icon} color={cat.color} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display font-medium">{cat.name}</p>
                <p className="text-xs text-muted-foreground">
                  {cat.expenseCount} expense{cat.expenseCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  aria-label={`Edit ${cat.name}`}
                  onClick={() => openEdit(cat)}
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-destructive"
                  aria-label={`Delete ${cat.name}`}
                  onClick={() => setDeleteId(cat.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </MotionCard>
          </StaggerItem>
        ))}

        <StaggerItem>
          <MotionCard
            className="flex h-full min-h-[88px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-muted-foreground transition-colors hover:bg-accent/50"
            onClick={openNew}
            role="button"
            tabIndex={0}
            aria-label="Add category"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNew();
              }
            }}
          >
            <Plus className="h-5 w-5" />
            <span>Add Category</span>
          </MotionCard>
        </StaggerItem>
      </Stagger>
```

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: completes with exit 0, no errors. (If it reports `'Card'`/`'CardContent'` declared-but-unused, the Step 1 replacement was incomplete — confirm the old import line is gone, then re-run.)

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, no errors/warnings for `category-manager.tsx`.

- [ ] **Step 5: Build.** Run:

```
pnpm build
```

Expected: build succeeds, `/categories` listed in the route table, exit 0.

- [ ] **Step 6: Visual verification (purely visual — no unit test).** Start dev (`pnpm dev`), then via chrome-devtools navigate to `http://localhost:3000/categories`. Use `resize_page` to set 1440x900 and `take_screenshot`, then 390x844 and `take_screenshot`. Confirm: cards are white with soft shadow (`shadow-card`, not a hairline border), `rounded-2xl` corners, the category color chip is visible, names render in Plus Jakarta Sans (`font-display`), the dashed "Add Category" tile sits last, cards cascade in on load and lift on tap/press, and there is no horizontal overflow at 390px.

- [ ] **Step 7: Commit.** Run:

```
git add src/components/categories/category-manager.tsx && git commit -m "Restyle categories grid with MotionCard, Stagger, soft cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 2: Add a friendly empty state to the categories page

- [ ] **Step 1: Add the icon + EmptyState imports.** In `src/components/categories/category-manager.tsx`, replace the lucide import line:

```tsx
import { Plus, Edit, Trash2 } from "lucide-react";
```

with:

```tsx
import { Plus, Edit, Trash2, Tags } from "lucide-react";
```

and add this import directly below the existing `ConfirmDialog` import (line 23):

```tsx
import { EmptyState } from "@/components/shared/empty-state";
```

- [ ] **Step 2: Branch on empty list.** The returned JSX currently is `<>{<Stagger>…</Stagger>}{<Dialog>…</Dialog>}{<ConfirmDialog … />}</>`. Wrap the `<Stagger>…</Stagger>` block (and only that block) in a ternary. Immediately after the opening `<>` add:

```tsx
      {categories.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="No categories yet"
          description="Categories group your expenses so you can see where the money goes. Add your first one to get started."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Category
            </Button>
          }
        />
      ) : (
```

and immediately after the closing `</Stagger>` add:

```tsx
      )}
```

Net structure: `<>{categories.length === 0 ? (<EmptyState … />) : (<Stagger>…</Stagger>)}<Dialog>…</Dialog><ConfirmDialog … /></>`.

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 5: Visual verification.** With dev running, in chrome-devtools open `http://localhost:3000/categories` against a household that has no categories (or delete all in the UI first). `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each. Confirm: the EmptyState (Tags icon in a muted rounded chip, title, description, "Add Category" button) is centered, and clicking the button opens the New Category dialog.

- [ ] **Step 6: Commit.** Run:

```
git add src/components/categories/category-manager.tsx && git commit -m "Add friendly empty state to categories manager

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 3: Restyle the members grid

- [ ] **Step 1: Add motion imports.** In `src/components/members/member-manager.tsx`, replace the line-4 card import:

```tsx
import { Card, CardContent } from "@/components/ui/card";
```

with (the grid no longer uses `Card`/`CardContent`):

```tsx
import { MotionCard } from "@/components/motion/motion-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
```

- [ ] **Step 2: Replace the grid JSX.** Replace the grid block (the `<div className="grid ...">...</div>` spanning lines 92-153) with the following. Note `text-yellow-500` on the Crown becomes `text-amber-500`, and `tabular-nums` is added to the money figure (it already reads `formatCurrency(member.totalSpent)` from the existing `const formatCurrency = useFormatCurrency()`):

```tsx
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => (
          <StaggerItem key={member.id}>
            <MotionCard className="group space-y-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-sm font-medium text-primary">
                      {member.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-display font-medium">{member.name}</p>
                      {member.role === "admin" && (
                        <Crown className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </div>
                    <Badge variant="secondary" className="mt-0.5 text-xs">
                      {member.role}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={`Edit ${member.name}`}
                    onClick={() => openEdit(member)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    aria-label={`Remove ${member.name}`}
                    onClick={() => setDeleteId(member.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{member.expenseCount} expenses</span>
                <span className="font-display font-medium tabular-nums text-foreground">
                  {formatCurrency(member.totalSpent)}
                </span>
              </div>
            </MotionCard>
          </StaggerItem>
        ))}

        <StaggerItem>
          <MotionCard
            className="flex h-full min-h-[120px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-muted-foreground transition-colors hover:bg-accent/50"
            onClick={openNew}
            role="button"
            tabIndex={0}
            aria-label="Add member"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNew();
              }
            }}
          >
            <Plus className="h-5 w-5" />
            <span>Add Member</span>
          </MotionCard>
        </StaggerItem>
      </Stagger>
```

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors. (If `'Card'`/`'CardContent'` are reported unused, confirm the Step 1 replacement removed the old import line.)

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 5: Build.** Run:

```
pnpm build
```

Expected: build succeeds, `/members` in the route table, exit 0.

- [ ] **Step 6: Visual verification.** With dev running, in chrome-devtools open `http://localhost:3000/members`; `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each. Confirm: white soft-shadow `rounded-2xl` cards, avatar fallback chip in indigo tint, admin Crown in amber, role Badge, `totalSpent` right-aligned and tabular, cascade on load, lift on press, dashed "Add Member" tile last, no overflow at 390px.

- [ ] **Step 7: Commit.** Run:

```
git add src/components/members/member-manager.tsx && git commit -m "Restyle members grid with MotionCard, Stagger, tabular totals

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 4: Add a friendly empty state to the members page

- [ ] **Step 1: Add the icon + EmptyState imports.** In `src/components/members/member-manager.tsx`, replace the lucide import line:

```tsx
import { Plus, Edit, Trash2, Crown } from "lucide-react";
```

with:

```tsx
import { Plus, Edit, Trash2, Crown, Users } from "lucide-react";
```

and add directly below the existing `ConfirmDialog` import (line 24):

```tsx
import { EmptyState } from "@/components/shared/empty-state";
```

- [ ] **Step 2: Branch on empty list.** Wrap the `<Stagger>…</Stagger>` block in a ternary. Immediately after the opening `<>` add:

```tsx
      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No members yet"
          description="Add the people in your household so you can track who spent what."
          action={
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Member
            </Button>
          }
        />
      ) : (
```

and immediately after the closing `</Stagger>` add:

```tsx
      )}
```

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 5: Visual verification.** With dev running, open `http://localhost:3000/members` for a household with no members; `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each. Confirm: centered EmptyState with Users icon, title, description, and an "Add Member" button that opens the Add Member dialog.

- [ ] **Step 6: Commit.** Run:

```
git add src/components/members/member-manager.tsx && git commit -m "Add friendly empty state to members manager

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 5: Restyle the households grid

- [ ] **Step 1: Add motion imports.** In `src/components/households/household-manager.tsx`, replace the line-4 card import:

```tsx
import { Card, CardContent } from "@/components/ui/card";
```

with (the grid no longer uses `Card`/`CardContent`; `Badge`, `Home`, `Check`, `Edit`, `Trash2`, `Plus` remain in use):

```tsx
import { MotionCard } from "@/components/motion/motion-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
```

- [ ] **Step 2: Replace the grid JSX.** Replace the grid block (the `<div className="grid ...">...</div>` spanning lines 103-164) with:

```tsx
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {households.map((h) => (
          <StaggerItem key={h.id}>
            <MotionCard className="group space-y-3 rounded-2xl bg-card p-4 shadow-card">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Home className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="font-display font-medium">{h.name}</p>
                    <p className="text-xs text-muted-foreground">{h.currency}</p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    aria-label={`Rename ${h.name}`}
                    onClick={() => openEdit(h)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    aria-label={`Delete ${h.name}`}
                    onClick={() => setDeleteId(h.id)}
                    disabled={households.length <= 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {h.id === currentId ? (
                <Badge variant="secondary" className="gap-1">
                  <Check className="h-3 w-3" /> Active
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleSwitch(h.id)}
                >
                  Switch to this household
                </Button>
              )}
            </MotionCard>
          </StaggerItem>
        ))}

        <StaggerItem>
          <MotionCard
            className="flex h-full min-h-[120px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/50 p-4 text-muted-foreground transition-colors hover:bg-accent/50"
            onClick={openNew}
            role="button"
            tabIndex={0}
            aria-label="New household"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNew();
              }
            }}
          >
            <Plus className="h-5 w-5" />
            <span>New household</span>
          </MotionCard>
        </StaggerItem>
      </Stagger>
```

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors. (If `'Card'`/`'CardContent'` are reported unused, confirm the Step 1 replacement removed the old import line.)

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 5: Build.** Run:

```
pnpm build
```

Expected: build succeeds, `/households` in the route table, exit 0.

- [ ] **Step 6: Visual verification.** With dev running, open `http://localhost:3000/households`; `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each. Confirm: white soft-shadow `rounded-2xl` cards, indigo Home chip, "Active" Badge on the current household, "Switch to this household" full-width button on the others, delete disabled when only one household exists, dashed "New household" tile last, cascade + tap lift, no overflow at 390px.

- [ ] **Step 7: Commit.** Run:

```
git add src/components/households/household-manager.tsx && git commit -m "Restyle households grid with MotionCard, Stagger, soft cards

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 6: Restyle the settings cards

- [ ] **Step 1: Apply Fresh Ledger tokens to the settings cards.** In `src/app/(app)/settings/page.tsx`, replace the two `<Card>` blocks (lines 17-52) with:

```tsx
      <Card className="rounded-2xl border-0 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="font-display">Household</CardTitle>
          <CardDescription>Your household information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Home className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display font-medium">{household?.name ?? "My Home"}</p>
              <p className="text-sm text-muted-foreground">Your household</p>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Currency</p>
            <CurrencySwitcher current={currency} />
            <p className="text-xs text-muted-foreground">
              Applied to all amounts across the app. Changes the symbol and
              formatting only — your recorded amounts stay the same.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 bg-card shadow-card">
        <CardHeader>
          <CardTitle className="font-display">About</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Outlay v0.1.0</p>
          <p>A collaborative household expense tracker</p>
          <p>Built with Next.js, SQLite, and shadcn/ui</p>
        </CardContent>
      </Card>
```

- [ ] **Step 2: Round the currency switcher trigger.** In `src/components/settings/currency-switcher.tsx`, replace the `SelectTrigger` opening tag (line 40):

```tsx
      <SelectTrigger className="w-56">
```

with:

```tsx
      <SelectTrigger className="w-56 rounded-xl">
```

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 5: Build.** Run:

```
pnpm build
```

Expected: build succeeds, `/settings` in the route table, exit 0.

- [ ] **Step 6: Visual verification.** With dev running, open `http://localhost:3000/settings`; `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each. Then toggle dark mode (via the theme toggle) and `take_screenshot` again at 1440x900. Confirm: both cards are white (light) / lifted warm-slate (dark) with `shadow-card` and `rounded-2xl`, titles in Plus Jakarta Sans, indigo Home tile, the currency Select trigger is `rounded-xl`, no overflow at 390px, dark parity holds.

- [ ] **Step 7: Commit.** Run:

```
git add "src/app/(app)/settings/page.tsx" src/components/settings/currency-switcher.tsx && git commit -m "Restyle settings cards and currency switcher with Fresh Ledger tokens

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: two files changed, commit created.

### Task 7: Restyle the login screen

- [ ] **Step 1: Warm the centered login card and restyle the Google button.** In `src/app/(auth)/login/page.tsx`, replace the `<Card ...>` opening tag through the closing `</form>` of the Google form (lines 32-59) with:

```tsx
    <Card className="w-full max-w-md rounded-3xl border-0 bg-card shadow-float">
      <CardHeader className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-card">
            <Home className="h-8 w-8" />
          </div>
        </div>
        <div>
          <CardTitle className="font-display text-2xl">Welcome to Outlay</CardTitle>
          <CardDescription className="mt-2">
            Track your household spending together
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <Button
            type="submit"
            variant="outline"
            className="h-12 w-full gap-3 rounded-xl text-base"
          >
            <GoogleIcon />
            Continue with Google
          </Button>
        </form>
```

Notes: `shadow-float`/`shadow-card` are the M1 tokens. The auth layout (`src/app/(auth)/layout.tsx`) already centers the card on `bg-background` (warm cream in light, warm slate in dark), so the warm canvas comes for free — do NOT add a background here. The inline `GoogleIcon` SVG keeps its official brand hex fills (`#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`) — these are an external brand asset, explicitly exempt from the token-only rule because they are not theme colors.

- [ ] **Step 2: Round the passcode form controls.** In `src/components/auth/passcode-form.tsx`, replace the `<Input ...>` block (lines 16-24) and the `<Button ...>` (line 28) with:

```tsx
      <Input
        type="password"
        name="passcode"
        placeholder="Enter household passcode"
        autoFocus
        required
        className="h-12 rounded-xl text-base"
        aria-invalid={state?.error ? true : undefined}
      />
      {state?.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" className="h-12 w-full rounded-xl text-base" disabled={pending}>
        {pending ? "Checking…" : "Unlock"}
      </Button>
```

- [ ] **Step 3: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 4: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 5: Build.** Run:

```
pnpm build
```

Expected: build succeeds, `/login` in the route table, exit 0.

- [ ] **Step 6: Visual verification.** With dev running, open `http://localhost:3000/login` in a logged-out context (use a fresh chrome-devtools page so no auth cookie is present). `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each, then dark mode at 1440x900. Confirm: centered card on warm cream canvas, `rounded-3xl` with `shadow-float`, indigo Home tile, title in Plus Jakarta Sans, Google button `rounded-xl` with the brand icon and a visible focus-visible ring on Tab (use `press_key` Tab then screenshot), the "or" divider, the passcode input + Unlock button `rounded-xl`, no overflow at 390px, dark parity holds.

- [ ] **Step 7: Commit.** Run:

```
git add "src/app/(auth)/login/page.tsx" src/components/auth/passcode-form.tsx && git commit -m "Restyle login card, Google button, and passcode form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: two files changed, commit created.

### Task 8: Soften the shared EmptyState to Fresh Ledger

- [ ] **Step 1: Apply display font and warmer chip.** In `src/components/shared/empty-state.tsx`, replace the returned JSX (lines 11-21) with:

```tsx
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="h-8 w-8" />
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
```

Note: props are unchanged. This component is consumed by `src/app/(app)/expenses/page.tsx` and by the categories/members managers (added above), so this single edit lifts every empty state at once.

- [ ] **Step 2: Typecheck.** Run:

```
pnpm exec tsc --noEmit
```

Expected: exit 0, no errors.

- [ ] **Step 3: Lint.** Run:

```
pnpm lint
```

Expected: exit 0, clean.

- [ ] **Step 4: Visual verification.** With dev running, open `http://localhost:3000/expenses` for a household with no expenses; `resize_page` to 1440x900 then 390x844 and `take_screenshot` at each. Confirm: `rounded-2xl` muted chip with the Receipt icon, title in Plus Jakarta Sans, description, "Add Expense" button below; then open `/categories` and `/members` (empty) and confirm both inherit the same look.

- [ ] **Step 5: Commit.** Run:

```
git add src/components/shared/empty-state.tsx && git commit -m "Soften shared EmptyState with display font and rounded chip

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 9: e2e — switch-household data isolation (TDD)

- [ ] **Step 0: Hard-fail fast if the M0 scaffold is absent.** This task consumes — it does NOT create — the Playwright scaffold. Run:

```
test -f playwright.config.ts && grep -q '"test:e2e"' package.json && pnpm ls @playwright/test
```

Expected: prints the installed `@playwright/test` version and exit 0. If this fails, STOP: finish the M0 scaffold task (it owns installing `@playwright/test` at latest-stable-pinned-exact via `pnpm add -D -E @playwright/test@latest && pnpm exec playwright install --with-deps chromium`, the `test:e2e` script `"test:e2e": "playwright test"`, and `playwright.config.ts` with the Pixel-7 project + `baseURL http://localhost:3000` + `webServer` seeding `file:./data/e2e.db` with `HOUSEHOLD_PASSCODE`) before continuing here.

- [ ] **Step 1: Write the failing e2e spec.** Create `e2e/switch-household-isolation.spec.ts` with this exact content:

```ts
import { expect, test, type Page } from "@playwright/test";

const PASSCODE = process.env.HOUSEHOLD_PASSCODE ?? "test-passcode";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Enter household passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.waitForURL("**/dashboard");
}

test("switching household isolates its data", async ({ page }) => {
  await login(page);

  // Capture household A's expense-row count.
  await page.goto("/expenses");
  const firstHouseholdRows = await page.getByTestId("expense-row").count();

  // The A-only marker expense must be visible while A is active.
  await expect(page.getByText("HOUSEHOLD_A_ONLY_EXPENSE")).toHaveCount(1);

  // Switch to household B via the /households manager.
  await page.goto("/households");
  await page
    .getByRole("button", { name: "Switch to this household" })
    .first()
    .click();

  // After switching, an "Active" badge is present (on B's card).
  await expect(page.getByText("Active").first()).toBeVisible();

  // Household B's expense set must differ from A's and must NOT leak A's marker.
  await page.goto("/expenses");
  const secondHouseholdRows = await page.getByTestId("expense-row").count();

  expect(secondHouseholdRows).not.toBe(firstHouseholdRows);
  await expect(page.getByText("HOUSEHOLD_A_ONLY_EXPENSE")).toHaveCount(0);
});
```

- [ ] **Step 2: Run the spec to confirm it fails.** Run:

```
pnpm test:e2e e2e/switch-household-isolation.spec.ts
```

Expected: the test FAILS, because (a) `getByTestId("expense-row")` matches nothing — the expense row `<div>` has no `data-testid` yet, and (b) the seed has no `HOUSEHOLD_A_ONLY_EXPENSE` marker and only one household. This confirms the test is wired and asserting the right thing before we make it pass.

- [ ] **Step 3: Add the `data-testid="expense-row"` hook.** In `src/components/expenses/expense-list.tsx`, the per-expense row root is the plain `<div>` opened at lines 73-76. Replace that opening tag:

```tsx
                <div
                  key={expense.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
```

with the same element plus the test hook (no other change — this is a test attribute, not a behavior change):

```tsx
                <div
                  key={expense.id}
                  data-testid="expense-row"
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
```

- [ ] **Step 4: Add a two-household isolation fixture to the e2e seed.** The seed logic lives in `src/lib/db/seed.ts` (run via `scripts/seed.ts` → `pnpm db:seed`); it currently early-returns when any household exists and creates exactly one household. Add an e2e branch keyed on the e2e DB so the production seed is untouched. Directly after the existing early-return guard

```ts
  const existing = await db.select().from(households).limit(1);
  if (existing.length > 0) {
    console.log("Database already seeded.");
    return;
  }
```

insert this block (it short-circuits the normal single-household seed when running against `e2e.db`):

```ts
  if ((process.env.DATABASE_URL ?? "").includes("e2e.db")) {
    await seedE2EIsolationFixture();
    console.log("Seeded e2e isolation fixture (2 households).");
    return;
  }
```

Then add this helper at the bottom of the file (it reuses the existing imports `households`, `householdMembers`, `categories`, `expenses`, `createId`, `DEFAULT_CATEGORIES`, `toMinorUnits`). Household A gets the marker expense and 3 rows; household B gets 1 row, so the counts differ:

```ts
async function seedE2EIsolationFixture() {
  for (const [idx, name, rows] of [
    [0, "House A", ["HOUSEHOLD_A_ONLY_EXPENSE", "A Groceries", "A Rent"]],
    [1, "House B", ["B Coffee"]],
  ] as const) {
    const householdId = createId();
    const memberId = createId();

    await db.insert(households).values({
      id: householdId,
      name,
      currency: "INR",
    });

    await db.insert(householdMembers).values({
      id: memberId,
      householdId,
      name: idx === 0 ? "Alice" : "Bob",
      role: "admin",
    });

    const firstCategory = DEFAULT_CATEGORIES[0];
    const categoryId = createId();
    await db.insert(categories).values({
      id: categoryId,
      householdId,
      name: firstCategory.name,
      icon: firstCategory.icon,
      color: firstCategory.color,
    });

    for (const description of rows) {
      await db.insert(expenses).values({
        id: createId(),
        householdId,
        categoryId,
        memberId,
        amount: toMinorUnits(100),
        description,
        date: new Date(),
      });
    }
  }
}
```

Note: confirm the `expenses` insert keys (`categoryId`, `memberId`, `amount`, `description`, `date`) against the existing `db.insert(expenses).values({...})` call already in `seed()` (around line 70) and match its exact column names/shape before running — adjust key names only if the existing insert differs. No schema or action changes.

- [ ] **Step 5: Re-run the spec to confirm it passes.** Run:

```
pnpm test:e2e e2e/switch-household-isolation.spec.ts
```

Expected: 1 passed. The Pixel-7 project logs in, reads A's rows + marker, switches to B, and confirms the counts differ and the A-only marker is absent in B.

- [ ] **Step 6: Run the full e2e suite for regressions.** Run:

```
pnpm test:e2e
```

Expected: all specs pass (the M0 smoke specs plus this isolation spec), exit 0.

- [ ] **Step 7: Commit.** Run:

```
git add e2e/switch-household-isolation.spec.ts src/components/expenses/expense-list.tsx src/lib/db/seed.ts && git commit -m "Add e2e for switch-household data isolation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: three files changed, commit created.

### Task 10: Wire the e2e job into CI (non-blocking)

- [ ] **Step 1: Add a separate, non-blocking e2e job.** In `.github/workflows/ci.yml`, append a second job as a sibling of the existing `ci` job (same indentation level under `jobs:`), mirroring its pnpm/Node setup. Add:

```yaml
  e2e:
    runs-on: ubuntu-latest
    continue-on-error: true
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: "true"
    steps:
      - uses: actions/checkout@v5

      - uses: pnpm/action-setup@v4
        with:
          version: 11

      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: Seed e2e database
        run: pnpm db:init
        env:
          DATABASE_URL: file:./data/e2e.db
          AUTH_SECRET: ci-only-dummy-secret
          HOUSEHOLD_PASSCODE: test-passcode

      - name: Run Playwright e2e
        run: pnpm test:e2e
        env:
          DATABASE_URL: file:./data/e2e.db
          AUTH_SECRET: ci-only-dummy-secret
          HOUSEHOLD_PASSCODE: test-passcode

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Notes: `continue-on-error: true` keeps the job non-blocking per scope; the `AUTH_SECRET`/`DATABASE_URL` env mirrors the existing build job's dummy-secret pattern; the temp `file:./data/e2e.db` never touches prod. `db:init` runs `db:migrate` then `db:seed`, and the seed branch added above produces the two-household fixture because `DATABASE_URL` contains `e2e.db`.

- [ ] **Step 2: Validate the workflow YAML parses.** Run:

```
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('YAML OK')"
```

Expected: `YAML OK`. (This confirms valid YAML; the GitHub Actions runner validates the schema on push.)

- [ ] **Step 3: Commit.** Run:

```
git add .github/workflows/ci.yml && git commit -m "Add non-blocking Playwright e2e job to CI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: one file changed, commit created.

### Task 11: a11y + reduced-motion sweep

- [ ] **Step 1: Verify reduced-motion degradation.** With dev running, use chrome-devtools `emulate` to set `prefers-reduced-motion: reduce`, then navigate in turn to `/dashboard`, `/expenses`, `/categories`, `/members`, `/households`, `/settings`, `/login`. For each, confirm entrances are instant/opacity-only with no card cascade, no count-up, and no tap-spring. This exercises the M1 primitives' `useReducedMotion` guard — if any surface still animates, the M1 primitive is broken: record it as a blocker for the M1 owner and do not patch it per-component here.

- [ ] **Step 2: Verify focus-visible rings + aria-labels.** With reduced-motion still on (then again with it off), Tab through `/categories`, `/members`, `/households`, `/settings`, `/login` using `press_key` Tab. Confirm every Button (including the dashed "Add" tiles, which are `role="button" tabIndex={0}`), Select trigger, Input, and the household "Switch" / login buttons show a visible focus-visible ring, and that the icon-only edit/delete buttons expose the `aria-label`s added in the grid tasks (verify with `take_snapshot` to read the accessibility tree). `take_screenshot` one focused state at 1440x900 as evidence.

- [ ] **Step 3: Run accessibility audits.** Using chrome-devtools `lighthouse_audit` with only the `accessibility` category, audit `http://localhost:3000/categories`, then `/members`, then `/login`. Expected: Accessibility score >= 90 on each. Record any AA contrast failures — pay special attention to muted text on cream, the `border-dashed` tiles, and `text-amber-500` Crown on the card. If a contrast pair fails AA, do NOT add a per-component override: identify the exact token to retune (a palette token in `src/app/globals.css`, owned by M1) and flag it for the M1 owner.

- [ ] **Step 4: Apply minimal a11y attribute fixes (if Step 2/3 surfaced any).** If the sweep found a missing `aria-label` or mislabeled control on a component edited in this section, apply the minimal attribute fix here, re-run the affected `lighthouse_audit` to confirm >= 90, then run:

```
git add -A && git commit -m "a11y: add missing labels surfaced in sweep

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: changed files committed. If the only required fixes are token retunes (owned by M1), do NOT commit token changes from this section — record them as blockers in the PR notes instead. If nothing needed fixing, skip this step and note "no changes needed" in the PR.

### Task 12: Mobile Lighthouse pass on the dashboard

- [ ] **Step 1: Build and serve a production bundle (Lighthouse perf is meaningless on dev).** Run the build, then start the production server (start it in the background so the audit can connect):

```
pnpm build
```

Then start the server in the background:

```
pnpm start
```

Expected: build succeeds; server listening on `http://localhost:3000`.

- [ ] **Step 2: Authenticate, then run a mobile Lighthouse audit on the dashboard.** In chrome-devtools, `emulate` a mobile device, navigate to `/login`, unlock with the passcode to establish the session, then run `lighthouse_audit` with categories `performance` and `accessibility` against `http://localhost:3000/dashboard`. Expected: Performance >= 90 and Accessibility >= 90.

- [ ] **Step 3: Remediate within scope if either score is below 90.** If Performance < 90, capture the top Lighthouse opportunities (likely the motion bundle, render-blocking resources, or unsized images) and apply the in-scope mitigations: keep `motion` usage inside small client components and lazy-load any flagged heavy client component via `next/dynamic`, e.g.:

```tsx
import dynamic from "next/dynamic";

const SpendingChart = dynamic(
  () => import("@/components/dashboard/spending-chart").then((m) => m.SpendingChart),
  { ssr: false },
);
```

(Substitute the actual flagged component path/name.) If Accessibility < 90, apply the label fix from the sweep or flag the token retune to M1. Re-run `lighthouse_audit` until both categories are >= 90.

- [ ] **Step 4: Final full verification gate.** Stop the prod server, then run the complete gate:

```
pnpm exec tsc --noEmit && pnpm lint && pnpm test && pnpm build
```

Expected: typecheck clean, lint clean, all unit tests pass, build succeeds — exit 0 on each.

- [ ] **Step 5: Commit any Lighthouse remediations (if Step 3 changed code).** Run:

```
git add -A && git commit -m "perf/a11y: meet mobile Lighthouse >=90 on dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected: changed files committed. If nothing changed, skip and record "scores already >= 90, no changes" in the PR notes.

### Critical Files for Implementation
- /Users/nanda/vibe-code/outlay/src/components/categories/category-manager.tsx
- /Users/nanda/vibe-code/outlay/src/components/members/member-manager.tsx
- /Users/nanda/vibe-code/outlay/src/components/households/household-manager.tsx
- /Users/nanda/vibe-code/outlay/src/app/(app)/settings/page.tsx
- /Users/nanda/vibe-code/outlay/src/components/settings/currency-switcher.tsx
- /Users/nanda/vibe-code/outlay/src/app/(auth)/login/page.tsx
- /Users/nanda/vibe-code/outlay/src/components/auth/passcode-form.tsx
- /Users/nanda/vibe-code/outlay/src/components/shared/empty-state.tsx
- /Users/nanda/vibe-code/outlay/src/components/expenses/expense-list.tsx
- /Users/nanda/vibe-code/outlay/src/lib/db/seed.ts
- /Users/nanda/vibe-code/outlay/.github/workflows/ci.yml
- /Users/nanda/vibe-code/outlay/e2e/switch-household-isolation.spec.ts (new)
