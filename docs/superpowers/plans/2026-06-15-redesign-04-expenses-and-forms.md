# Redesign M4 — Expenses List & Add/Edit Flow

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the grouped expense list (sticky headers, soft rows, swipe-to-delete with a button fallback) and turn add/edit into a mobile bottom sheet the FAB morphs into, with a chip category selector.

**Architecture:** expense-list gets motion drag + confirm; the mobile add/edit reuses the existing Sheet (side='bottom') with a shared-element layoutId='add-fab' morph from the nav FAB; desktop keeps the page route. Server actions untouched.

**Tech Stack:** motion/react (drag + layoutId), Base UI Sheet, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`

---

## Conventions (canonical — read first)

- **Branch:** do all redesign work on a single `redesign/fresh-ledger` branch off `main` (not per-task branches). Commit after each green checkpoint.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the repo's established trailer).
- **Token utilities (Tailwind v4, defined in `src/app/globals.css` @theme):** use the NAMED utilities `shadow-card` / `shadow-float` / `shadow-pop` and `font-display` — not arbitrary `shadow-[var(--shadow-card)]` forms. Color via `bg-background`/`bg-card`/`bg-primary`/`text-foreground`/`text-muted-foreground`/`border-border`; radius via `rounded-2xl`/`rounded-3xl`; money via `tabular-nums`. No hardcoded hex/rgb/box-shadow in components.
- **Motion primitives (`src/components/motion/`, import from `motion/react`):** `PageTransition`, `AnimatedNumber({value, format, className})`, `Stagger` / `StaggerItem`, `MotionCard`. All honor `useReducedMotion()`. Reuse them — do not hand-roll bespoke `motion.div` variants on surfaces (shell chrome like the FAB/pill may use inline `motion` for layoutId, which is expected).
- **Invariants:** do NOT change `src/lib/queries/*` or `src/lib/actions/*` behavior/signatures or the props components receive — presentation + interaction only. next-themes stays; dark mode reaches parity via tokens. Restyle `src/components/ui/*` (Base UI/shadcn) via classes — do not fork. cva + `cn` for every component. lucide per-icon imports. Mobile: `env(safe-area-inset-bottom)`, ≥44px targets, no overflow at 390px. Respect `prefers-reduced-motion`; keep focus-visible rings; AA contrast.
- **Verification:** logic → vitest TDD; purely-visual → `pnpm exec tsc --noEmit` + `pnpm lint` + `pnpm build` + chrome-devtools screenshots at 1440×900 and 390×844 in light AND dark. Flows → `pnpm test:e2e`.
- **Sequencing:** **M4** — requires M1 (motion + tokens) and M2 (the mobile-nav FAB must define `layoutId="add-fab"`, with exactly one element owning it at a time). Requires M0's Playwright scaffold for the add-expense e2e (spec file only — do not re-scaffold). The add-expense e2e asserts the dashboard total via `[data-slot="hero-total"]` from Plan 03.
---

This section restyles the grouped expenses list (sticky date headers, soft category-chip rows, tap-to-edit), adds mobile swipe-to-delete via Motion drag with a confirm step plus a reduced-motion/desktop button fallback, converts add/edit into a FAB-morphed bottom Sheet on mobile (page route preserved on desktop), and replaces the category dropdown with a chip selector and members with avatar chips. It depends on the M1 `motion` install and `src/components/motion/*` primitives and the M2 FAB `layoutId`; it changes no Server Action or query behavior. Because the changes are interaction/visual, verification is tsc + lint + build + screenshots + a Playwright e2e, not unit tests (except the one pure swipe-threshold helper, which is TDD'd).

> Dependency note (verified against the repo): as of this section the M0 Playwright scaffold does NOT exist (`@playwright/test` is not installed, there is no `playwright.config.ts`, no `e2e/` dir, and no `test:e2e` script). The e2e task below therefore creates the scaffold itself rather than assuming it. Likewise `motion` is not yet installed, `src/components/motion/*` does not exist, the `--shadow-card`/`--shadow-float` tokens are not in `globals.css`, and `src/components/layout/mobile-nav.tsx` has no FAB `layoutId` — those are genuine M1/M2 prerequisites, so the steps that consume them include a guard that stops and flags the missing dependency rather than inventing a substitute.

### Task 1: Restyle the grouped expense list shell (sticky headers + soft rows)

- [ ] **Step 1: Read the current file and confirm the row data contract.** Open `src/components/expenses/expense-list.tsx` and confirm the `ExpenseItem` interface fields (`id, amount, description, date, categoryName, categoryIcon, categoryColor, memberName`). Note that `getExpenses` (`src/lib/queries/expense-queries.ts`) additionally returns `categoryId, memberId, notes, createdAt`, which the list type does not declare; the new `ExpenseRow` only needs the eight fields already typed, so no type widening is required here. No edit yet; this is the orientation read.

- [ ] **Step 2: Replace the group-shell markup with sticky headers and soft cards.** Modify `src/components/expenses/expense-list.tsx` — replace the entire JSX `return (...)` block (current lines 58-124) with the markup below. This keeps the existing `useState`/`handleDelete`/`grouped` logic untouched and delegates each row to a new `<ExpenseRow>` (added in the next task). Full replacement of the JSX return:

```tsx
  return (
    <>
      <div className="space-y-8">
        {Object.entries(grouped).map(([date, items]) => (
          <section key={date}>
            <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-center justify-between bg-background/80 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/60">
              <h3 className="font-display text-sm font-semibold text-muted-foreground">
                {format(parseISO(date), "EEEE, MMMM d, yyyy")}
              </h3>
              <span className="font-display text-sm font-semibold tabular-nums">
                {formatCurrency(items.reduce((sum, e) => sum + e.amount, 0))}
              </span>
            </div>
            <div className="space-y-2">
              {items.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  formatCurrency={formatCurrency}
                  onRequestDelete={() => setDeleteId(expense.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(open) => !open && setDeleteId(null)}
        title="Delete expense"
        description="Are you sure? This action cannot be undone."
        onConfirm={handleDelete}
        loading={loading}
      />
    </>
  );
```

- [ ] **Step 3: Replace the import block with exactly what the list still uses.** In `src/components/expenses/expense-list.tsx`, replace the entire current import block (lines 1-18) with the block below. The row now owns `Link`, `Edit`, `Trash2`, `MoreVertical`, `Button`, the `DropdownMenu*` primitives, and `CategoryIcon`, so they are dropped here; `ExpenseRow` is added:

```tsx
"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { useFormatCurrency } from "@/components/providers/currency-provider";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteExpense } from "@/lib/actions/expense-actions";
import { toast } from "sonner";
import { ExpenseRow } from "./expense-row";
```

- [ ] **Step 4: Run typecheck (expected to fail until ExpenseRow exists).** Command: `pnpm exec tsc --noEmit`. Expected output: an error `Cannot find module './expense-row' or its corresponding type declarations.` — this confirms the list now depends on the row we build next. Do not commit yet.

### Task 2: Build the ExpenseRow with swipe-to-delete and a button fallback

- [ ] **Step 5: Write a failing test for the swipe-threshold helper.** This is the one piece of real logic (drag-distance to "should reveal delete"), so it is TDD'd. Create `src/components/expenses/swipe-threshold.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldRevealDelete, SWIPE_REVEAL_PX } from "./swipe-threshold";

describe("shouldRevealDelete", () => {
  it("does not reveal for small left drags", () => {
    expect(shouldRevealDelete(-10)).toBe(false);
  });
  it("reveals once the left drag passes the threshold", () => {
    expect(shouldRevealDelete(-(SWIPE_REVEAL_PX + 1))).toBe(true);
  });
  it("never reveals on right drags", () => {
    expect(shouldRevealDelete(120)).toBe(false);
  });
  it("treats exactly the threshold as not yet revealed", () => {
    expect(shouldRevealDelete(-SWIPE_REVEAL_PX)).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to see it fail.** Command: `pnpm exec vitest run src/components/expenses/swipe-threshold.test.ts`. Expected output: failure resolving the import, e.g. `Failed to resolve import "./swipe-threshold"` / `Cannot find module './swipe-threshold'`.

- [ ] **Step 7: Write the minimal helper to pass.** Create `src/components/expenses/swipe-threshold.ts`:

```ts
/** Horizontal drag distance (px, leftward) past which the delete affordance is committed. */
export const SWIPE_REVEAL_PX = 72;

/**
 * Pure decision: given a horizontal offset (negative = dragged left), should the
 * row commit to revealing/confirming delete? Right drags never reveal.
 */
export function shouldRevealDelete(offsetX: number): boolean {
  return offsetX < -SWIPE_REVEAL_PX;
}
```

- [ ] **Step 8: Run the test to see it pass.** Command: `pnpm exec vitest run src/components/expenses/swipe-threshold.test.ts`. Expected output: `1 passed` test file containing `4 passed` assertions (Vitest prints `Test Files 1 passed` and `Tests 4 passed`).

- [ ] **Step 9: Confirm the M1 prerequisites are present before writing the row.** The row consumes the `motion` package and the `--shadow-card` token, both M1 deliverables. Run both guards now: `node -e "require.resolve('motion/react')" && grep -n '"motion"' package.json && grep -n "shadow-card" src/app/globals.css`. Expected output: a resolved path, a pinned `"motion"` line in `package.json`, and at least one `shadow-card` match. If `motion` is missing AND you are running this section standalone (M1 not yet merged), install it with a command that resolves latest stable and pins exact: `pnpm add motion --save-exact` (writes the resolved exact version and lockfile). If `--shadow-card` is missing, this section is blocked on M1 — do NOT invent a hardcoded shadow value; stop and flag the dependency.

- [ ] **Step 10: Create the ExpenseRow component.** Create `src/components/expenses/expense-row.tsx`. It uses Motion drag for the swipe on mobile, but ALWAYS renders a visible delete button so reduced-motion and desktop users can delete without swiping; `useReducedMotion()` disables drag and the tap-scale. Tapping the row body navigates to edit via a plain `Link` to `/expenses/${expense.id}/edit`. Full file:

```tsx
"use client";

import Link from "next/link";
import { m, useReducedMotion, type PanInfo } from "motion/react";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "./category-icon";
import { shouldRevealDelete } from "./swipe-threshold";

interface ExpenseRowItem {
  id: string;
  amount: number;
  description: string;
  categoryName: string;
  categoryIcon: string;
  categoryColor: string;
  memberName: string;
}

interface ExpenseRowProps {
  expense: ExpenseRowItem;
  formatCurrency: (value: number) => string;
  onRequestDelete: () => void;
}

export function ExpenseRow({
  expense,
  formatCurrency,
  onRequestDelete,
}: ExpenseRowProps) {
  const reduceMotion = useReducedMotion();
  const [dragging, setDragging] = useState(false);

  function handleDragEnd(_event: unknown, info: PanInfo) {
    setDragging(false);
    if (shouldRevealDelete(info.offset.x)) {
      onRequestDelete();
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-end bg-destructive/10 pr-5 text-destructive">
        <Trash2 className="size-5" />
      </div>
      <m.div
        drag={reduceMotion ? false : "x"}
        dragConstraints={{ left: -96, right: 0 }}
        dragElastic={0.1}
        onDragStart={() => setDragging(true)}
        onDragEnd={handleDragEnd}
        whileTap={reduceMotion ? undefined : { scale: 0.99 }}
        className="relative flex items-center gap-3 rounded-2xl bg-card p-3 shadow-[var(--shadow-card)]"
      >
        <CategoryIcon icon={expense.categoryIcon} color={expense.categoryColor} />
        <Link
          href={`/expenses/${expense.id}/edit`}
          onClick={(event) => {
            if (dragging) event.preventDefault();
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{expense.description}</p>
            <p className="truncate text-xs text-muted-foreground">
              {expense.categoryName} &middot; {expense.memberName}
            </p>
          </div>
          <span className="whitespace-nowrap font-display text-sm font-semibold tabular-nums">
            {formatCurrency(expense.amount)}
          </span>
        </Link>
        <button
          type="button"
          aria-label={`Delete ${expense.description}`}
          onClick={onRequestDelete}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          <Trash2 className="size-4" />
        </button>
      </m.div>
    </div>
  );
}
```

- [ ] **Step 11: Typecheck.** Command: `pnpm exec tsc --noEmit`. Expected output: no errors (the `./expense-row` import from Task 1 now resolves, and `PanInfo`/`m`/`useReducedMotion` resolve from `motion/react`).

- [ ] **Step 12: Lint.** Command: `pnpm lint`. Expected output: clean exit (no errors/warnings) for `expense-list.tsx`, `expense-row.tsx`, and `swipe-threshold.ts`.

- [ ] **Step 13: Commit.** Command:

```bash
git add -A && git commit -m "feat(expenses): restyle list with sticky headers, soft rows, swipe-to-delete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected output: a commit recording `expense-list.tsx`, `expense-row.tsx`, `swipe-threshold.ts`, and `swipe-threshold.test.ts`.

### Task 3: Convert the expense form to a chip category selector + avatar member chips + large amount

- [ ] **Step 14: Read the form to confirm the contract fields.** Open `src/components/expenses/expense-form.tsx`. Confirm the action reads these exact `FormData` keys (must be preserved): `amount`, `date`, `description`, `categoryId`, `memberId`, `notes`. The redesign must still submit all six; the chip selectors will write `categoryId`/`memberId` via hidden inputs so `createExpense`/`updateExpense` in `expense-actions.ts` keep working unchanged.

- [ ] **Step 15: Update the imports.** In `src/components/expenses/expense-form.tsx`, remove the `Select*` import block (current lines 9-15). The file already imports `useState` (line 3) and `useRouter` (line 4) — do NOT re-import `useState`. Add these three imports alongside the existing ones (e.g. directly after the `Textarea` import on line 8):

```tsx
import { CategoryIcon } from "@/components/expenses/category-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
```

- [ ] **Step 16: Add controlled chip state.** In `src/components/expenses/expense-form.tsx`, just after `const isEditing = !!expense;` (current line 38), add:

```tsx
  const [categoryId, setCategoryId] = useState(
    expense?.categoryId ?? categories[0]?.id ?? "",
  );
  const [memberId, setMemberId] = useState(
    expense?.memberId ?? members[0]?.id ?? "",
  );
```

- [ ] **Step 17: Swap the amount field for a large display.** In `src/components/expenses/expense-form.tsx`, replace the amount `<div className="space-y-2">` block (the `Label htmlFor="amount"` + its `Input`, current lines 67-79) with:

```tsx
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={expense?.amount}
                required
                className="h-14 font-display text-3xl font-semibold tabular-nums"
              />
            </div>
```

- [ ] **Step 18: Replace the Category Select with a horizontal chip selector.** In `src/components/expenses/expense-form.tsx`, replace the Category `<div className="space-y-2">` block (the `Label htmlFor="categoryId"` + `<Select name="categoryId">…</Select>`, current lines 104-118) with:

```tsx
            <div className="space-y-2">
              <Label>Category</Label>
              <input type="hidden" name="categoryId" value={categoryId} />
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {categories.map((cat) => {
                  const active = cat.id === categoryId;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                      <span className="whitespace-nowrap">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
```

- [ ] **Step 19: Replace the Member Select with avatar chips.** In `src/components/expenses/expense-form.tsx`, replace the "Paid by" `<div className="space-y-2">` block (the `Label htmlFor="memberId"` + `<Select name="memberId">…</Select>`, current lines 119-133) with:

```tsx
            <div className="space-y-2">
              <Label>Paid by</Label>
              <input type="hidden" name="memberId" value={memberId} />
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {members.map((member) => {
                  const active = member.id === memberId;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setMemberId(member.id)}
                      aria-pressed={active}
                      className={cn(
                        "flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        active
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <Avatar size="sm">
                        <AvatarFallback>
                          {member.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="whitespace-nowrap pr-1">{member.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
```

- [ ] **Step 20: Stack the two chip rows instead of side-by-side.** In `src/components/expenses/expense-form.tsx`, the category+member pair previously sat in the second `<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">` wrapper (current line 103). Change that wrapper's `className` to `"space-y-4"` so the two full-width horizontally-scrolling chip rows stack (side-by-side would clip the scroll). Leave the first grid (amount + date, current line 66) as-is.

- [ ] **Step 21: Typecheck.** Command: `pnpm exec tsc --noEmit`. Expected output: no errors. (`Category` exposes `icon` and `color` and `HouseholdMember` exposes `name`, both confirmed in `src/lib/db/schema.ts`; `CategoryIcon` accepts `size="sm"` and `Avatar` accepts `size="sm"`.)

- [ ] **Step 22: Lint.** Command: `pnpm lint`. Expected output: clean exit for `expense-form.tsx`.

- [ ] **Step 23: Commit.** Command:

```bash
git add -A && git commit -m "feat(expenses): chip category selector, avatar member chips, large amount

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected output: one commit touching `expense-form.tsx`.

### Task 4: Mobile add/edit bottom sheet that the FAB morphs into (desktop keeps the route)

- [ ] **Step 24: Confirm the FAB exposes a shared `layoutId` (M2 prerequisite).** Command: `grep -rn "layoutId" src/components/layout/mobile-nav.tsx`. Expected output: a `layoutId="add-fab"` on the center FAB element (added in M2). If absent, this section is blocked on M2 — do NOT invent a new FAB; stop and flag the dependency. Once present, reuse the exact string `add-fab` below; if M2 chose a different string, update the `layoutId` in Step 25 to match it.

- [ ] **Step 25: Confirm the Sheet exports a description primitive (a11y requirement).** The Base UI Sheet requires an accessible description; confirm the export name before writing the component. Command: `grep -n "SheetDescription" src/components/ui/sheet.tsx`. Expected output: an exported `SheetDescription`. If it is absent, add it via `pnpm dlx shadcn@latest add sheet` (re-pulls the primitive) rather than hand-writing one. The sheet component in Step 26 uses a visually-hidden `SheetDescription` so the dialog is labelled and described.

- [ ] **Step 26: Create the client wrapper that hosts the Sheet on mobile.** Create `src/components/expenses/add-expense-sheet.tsx`. It renders the mobile FAB morph target (matching the nav FAB `layoutId`), opens a bottom Sheet containing `ExpenseForm`, and is `md:hidden` on desktop (the nav link/route handles desktop add). It accepts the same `categories`/`members` the form needs. Full file:

```tsx
"use client";

import { m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ExpenseForm } from "@/components/expenses/expense-form";
import type { Category, HouseholdMember } from "@/lib/db/schema";

interface AddExpenseSheetProps {
  categories: Category[];
  members: HouseholdMember[];
}

export function AddExpenseSheet({ categories, members }: AddExpenseSheetProps) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();

  return (
    <>
      <m.button
        type="button"
        aria-label="Add expense"
        onClick={() => setOpen(true)}
        layoutId={reduceMotion ? undefined : "add-fab"}
        whileTap={reduceMotion ? undefined : { scale: 0.94 }}
        className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-float)] md:hidden"
      >
        <Plus className="size-6" />
      </m.button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] overflow-y-auto rounded-t-3xl pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader>
            <SheetTitle className="font-display">New Expense</SheetTitle>
            <SheetDescription className="sr-only">
              Add a new household expense.
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-2">
            <ExpenseForm
              categories={categories}
              members={members}
              variant="sheet"
              onDone={() => setOpen(false)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

- [ ] **Step 27: Extend `ExpenseForm` props with `variant`/`onDone`.** In `src/components/expenses/expense-form.tsx`, replace the `ExpenseFormProps` interface (current lines 21-33) with:

```tsx
interface ExpenseFormProps {
  categories: Category[];
  members: HouseholdMember[];
  expense?: {
    id: string;
    amount: number;
    description: string;
    date: string;
    categoryId: string;
    memberId: string;
    notes: string | null;
  };
  variant?: "page" | "sheet";
  onDone?: () => void;
}
```

Update the function signature (current line 35) to: `export function ExpenseForm({ categories, members, expense, variant = "page", onDone }: ExpenseFormProps) {`.

- [ ] **Step 28: Branch the post-success navigation (no duplicated toast).** In `src/components/expenses/expense-form.tsx`, in `handleSubmit`, replace the two lines that currently read the success toast and `router.push("/expenses")` (current lines 52-53) with the branch below. The toast still fires exactly once:

```tsx
      toast.success(isEditing ? "Expense updated" : "Expense added");
      if (variant === "sheet") {
        onDone?.();
        router.refresh();
      } else {
        router.push("/expenses");
      }
```

- [ ] **Step 29: Make the Card chrome conditional so the sheet form is bare.** In `src/components/expenses/expense-form.tsx`, replace the entire current `return ( <Card> … </Card> );` (current lines 59-157) with the structure below. The `<form>` JSX is the EXISTING form body verbatim — amount+date grid, description, the chip selectors (from Steps 18-20), notes, and the button row — moved unchanged into `formBody`, except the Cancel button's `onClick` is updated as noted:

```tsx
  const formBody = (
    <form action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={expense?.amount}
            required
            className="h-14 font-display text-3xl font-semibold tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={expense?.date || new Date().toLocaleDateString("en-CA")}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          placeholder="What did you spend on?"
          defaultValue={expense?.description}
          required
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <input type="hidden" name="categoryId" value={categoryId} />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {categories.map((cat) => {
              const active = cat.id === categoryId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                  <span className="whitespace-nowrap">{cat.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Paid by</Label>
          <input type="hidden" name="memberId" value={memberId} />
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {members.map((member) => {
              const active = member.id === memberId;
              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => setMemberId(member.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border px-2 py-1.5 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Avatar size="sm">
                    <AvatarFallback>
                      {member.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="whitespace-nowrap pr-1">{member.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          placeholder="Any additional details..."
          defaultValue={expense?.notes || ""}
          rows={3}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : isEditing ? "Update Expense" : "Add Expense"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (variant === "sheet" ? onDone?.() : router.back())}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  if (variant === "sheet") return formBody;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display">
          {isEditing ? "Edit Expense" : "New Expense"}
        </CardTitle>
      </CardHeader>
      <CardContent>{formBody}</CardContent>
    </Card>
  );
```

- [ ] **Step 30: Mount the sheet from the expenses page (data from the Server Component).** Modify `src/app/(app)/expenses/page.tsx`. Add these imports after the existing `getCurrentHousehold` import:

```tsx
import { AddExpenseSheet } from "@/components/expenses/add-expense-sheet";
import { getCategories } from "@/lib/queries/category-queries";
import { getMembers } from "@/lib/queries/member-queries";
```

Then replace the entire `ExpenseContent` function (current lines 14-36) with:

```tsx
async function ExpenseContent() {
  const household = await getCurrentHousehold();
  if (!household) return null;

  const [expenses, categories, members] = await Promise.all([
    getExpenses(household.id),
    getCategories(household.id),
    getMembers(household.id),
  ]);

  if (expenses.length === 0) {
    return (
      <>
        <EmptyState
          icon={Receipt}
          title="No expenses yet"
          description="Start tracking your spending by adding your first expense."
          action={
            <Button nativeButton={false} render={<Link href="/expenses/new" />}>
              <Plus className="mr-2 h-4 w-4" /> Add Expense
            </Button>
          }
        />
        <AddExpenseSheet categories={categories} members={members} />
      </>
    );
  }

  return (
    <>
      <ExpenseList expenses={expenses} />
      <AddExpenseSheet categories={categories} members={members} />
    </>
  );
}
```

- [ ] **Step 31: Confirm `--shadow-float` exists (M1 prerequisite).** Command: `grep -n "shadow-float" src/app/globals.css`. Expected output: at least one match. If absent, this section is blocked on M1 — stop and flag; do NOT hardcode a shadow value.

- [ ] **Step 32: Typecheck.** Command: `pnpm exec tsc --noEmit`. Expected output: no errors. (`Category` and `HouseholdMember` are exported from `@/lib/db/schema`; `SheetDescription` is exported from `@/components/ui/sheet` after Step 25.)

- [ ] **Step 33: Lint.** Command: `pnpm lint`. Expected output: clean exit for `add-expense-sheet.tsx`, `expense-form.tsx`, and `page.tsx`.

- [ ] **Step 34: Build.** Command: `pnpm build`. Expected output: `✓ Compiled successfully`, the `/expenses` route listed in the route table, and no type or prerender errors.

- [ ] **Step 35: Commit.** Command:

```bash
git add -A && git commit -m "feat(expenses): FAB-morph bottom sheet for add/edit on mobile

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected output: one commit touching `add-expense-sheet.tsx`, `expense-form.tsx`, and `src/app/(app)/expenses/page.tsx`.

### Task 5: Visual verification (screenshots, both breakpoints, both themes)

This task is purely visual/interaction — there is no meaningful unit test, so verification is the tsc/lint/build above plus chrome-devtools screenshots at desktop 1440x900 and mobile 390x844 in both themes, plus an interaction checklist.

- [ ] **Step 36: Start the dev server.** Command: `pnpm dev` (run in background). Expected output: `Ready` on `http://localhost:3000`.

- [ ] **Step 37: Desktop screenshot of the list (1440x900).** Call `mcp__chrome-devtools__resize_page` with width 1440, height 900; `mcp__chrome-devtools__navigate_page` to `http://localhost:3000/expenses`; then `mcp__chrome-devtools__take_screenshot`. Expected: sticky day headers, soft rounded `bg-card` rows each with a colored category icon chip, a visible trash button per row, and NO FAB (the FAB is `md:hidden`).

- [ ] **Step 38: Mobile screenshot of the list (390x844).** `mcp__chrome-devtools__resize_page` to width 390, height 844; `mcp__chrome-devtools__navigate_page` to `http://localhost:3000/expenses`; `mcp__chrome-devtools__take_screenshot`. Expected: same rows, plus the elevated indigo FAB visible bottom-right clearing the bottom nav; headers stick on scroll.

- [ ] **Step 39: Mobile screenshot of the add sheet (390x844).** With the viewport still 390x844, `mcp__chrome-devtools__click` the element with `aria-label="Add expense"`, `mcp__chrome-devtools__wait_for` text "New Expense", then `mcp__chrome-devtools__take_screenshot`. Expected: bottom sheet with a large amount input, a horizontally-scrolling category chip row, member avatar chips, rounded top corners, and bottom padding clearing the home indicator.

- [ ] **Step 40: Dark-mode spot check (390x844).** `mcp__chrome-devtools__evaluate_script` running `document.documentElement.classList.add('dark')`, then `mcp__chrome-devtools__take_screenshot` of both the list and (re-open and) the sheet at 390x844. Expected: warm near-black surfaces, indigo accents intact, chips legible — no hardcoded-color regressions. Reset afterward with `mcp__chrome-devtools__evaluate_script` running `document.documentElement.classList.remove('dark')`.

- [ ] **Step 41: Interaction checklist (via chrome-devtools, not manual).** Drive each and confirm: (a) `mcp__chrome-devtools__click` a row body navigates to `/expenses/<id>/edit`; (b) `mcp__chrome-devtools__click` the per-row trash button opens the ConfirmDialog (works without swiping — the reduced-motion/desktop fallback); (c) on mobile, `mcp__chrome-devtools__drag` a row leftward past ~72px opens the same ConfirmDialog; (d) money is `tabular-nums` and in `font-display`; (e) clicking a different category chip / member chip moves the `aria-pressed` highlight; (f) no horizontal page overflow at 390px (chip rows scroll, the page does not).

- [ ] **Step 42: Reduced-motion check (390x844).** `mcp__chrome-devtools__emulate` with `{ "media": [{ "name": "prefers-reduced-motion", "value": "reduce" }] }` (or `mcp__chrome-devtools__evaluate_script` overriding `matchMedia` if `emulate` is unavailable), reload `/expenses`. Expected: rows do not drag (drag disabled), the FAB opens the sheet without the morph, and delete still works via the per-row trash button. `mcp__chrome-devtools__take_screenshot` to confirm the list renders.

### Task 6: Playwright e2e — add an expense and assert list + dashboard update

> ⚠️ **Playwright is already scaffolded in Plan 01 (M0)** — this section was drafted before M0 was finalized, so Steps 43–45 below re-create the harness. Since M0 runs first, **SKIP Steps 43–45** (install, `test:e2e` script, `playwright.config.ts`). In particular, do NOT create the alternate **port-3100** config shown below — use Plan 01's canonical config (Pixel-7, `baseURL http://localhost:3000`, webServer seeding `file:./data/e2e.db` with `HOUSEHOLD_PASSCODE`). Start at the spec-file step; the dashboard-total assertion uses `[data-slot="hero-total"]` (added in Plan 03).

- [ ] **Step 43: Install Playwright (latest stable, pinned exact) and its browser.** Commands: `pnpm add -D playwright @playwright/test --save-exact` (resolves the latest stable and writes the exact resolved version + lockfile entry), then `pnpm exec playwright install chromium`. Expected output: both packages appear in `devDependencies` with concrete pinned versions and Chromium downloads successfully.

- [ ] **Step 44: Add the `test:e2e` script.** In `package.json`, add to `"scripts"` (it currently has `test`, `test:watch`, and the `db:*` scripts but no `test:e2e`): `"test:e2e": "playwright test"`. Verify with `grep -n '"test:e2e"' package.json`. Expected output: the new line.

- [ ] **Step 45: Create the Playwright config with a mobile project, a seeded temp DB, and a webServer.** Create `playwright.config.ts` at the repo root. It seeds a throwaway SQLite file, sets the passcode the webServer/tests share, and runs the built app on port 3100 so it never collides with `pnpm dev`. Full file:

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const DATABASE_URL = "file:./data/e2e.db";
const HOUSEHOLD_PASSCODE = "test1234";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `rm -f data/e2e.db && pnpm db:migrate && pnpm db:seed && pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL,
      HOUSEHOLD_PASSCODE,
      AUTH_SECRET: "e2e-secret-not-for-prod",
    },
  },
});
```

- [ ] **Step 46: Confirm the login + passcode env contract the spec relies on.** Commands: `grep -rn "HOUSEHOLD_PASSCODE\|passcode" src/proxy.ts src/lib/gate.ts src/app/\(auth\)/login 2>/dev/null` and `grep -rn "name=\|getByLabel\|passcode\|Enter\|Unlock" src/app/\(auth\)/login/*.tsx`. Expected output: the passcode env var name and the login form's field/button labels. Use the exact label and button text found here in Step 47 rather than guessing; if the field has no accessible label, add `aria-label="Passcode"` to the input in the login form (a one-line a11y fix) so the test can target it.

- [ ] **Step 47: Confirm the dashboard hero exposes a stable selector (M3 dependency).** Command: `grep -rn 'data-slot="hero-total"' src/components/dashboard src/app/\(app\)/dashboard 2>/dev/null`. Expected output: a match on the hero total figure (added in M3). If absent, the M3 hero must expose `data-slot="hero-total"` on the count-up total element — coordinate with the M3 author to add it (do NOT invent an unrelated selector). If M3 used a different stable hook, note the actual selector and substitute it in Step 48.

- [ ] **Step 48: Write the add-expense e2e spec.** Create `e2e/add-expense.spec.ts`. Adjust the two login lines to match the field/button labels found in Step 46. Full file:

```ts
import { test, expect } from "@playwright/test";

const UNIQUE = `E2E coffee ${Date.now()}`;
const PASSCODE = process.env.HOUSEHOLD_PASSCODE ?? "test1234";

test("add an expense; it appears in the list and updates the dashboard", async ({
  page,
}) => {
  // Passcode auth (Pixel 7 project => mobile FAB sheet path).
  await page.goto("/login");
  await page.getByLabel(/passcode/i).fill(PASSCODE);
  await page.getByRole("button", { name: /enter|continue|unlock/i }).click();

  await page.goto("/dashboard");
  const totalBefore = await page
    .locator('[data-slot="hero-total"]')
    .first()
    .innerText();

  await page.goto("/expenses");
  await page.getByRole("button", { name: /add expense/i }).click();
  await expect(page.getByText("New Expense")).toBeVisible();

  await page.getByLabel(/amount/i).fill("4.50");
  await page.getByLabel(/description/i).fill(UNIQUE);
  // First category + member chips are preselected by default; submit as-is.
  await page.getByRole("button", { name: /add expense/i }).last().click();

  // Sheet closes, list refreshes.
  await expect(page.getByText(UNIQUE)).toBeVisible();

  await page.goto("/dashboard");
  const totalAfter = await page
    .locator('[data-slot="hero-total"]')
    .first()
    .innerText();
  expect(totalAfter).not.toBe(totalBefore);
});
```

- [ ] **Step 49: Run the e2e.** Command: `pnpm test:e2e e2e/add-expense.spec.ts`. (The config's `webServer` seeds the temp DB, sets `HOUSEHOLD_PASSCODE=test1234`, builds, and serves on 3100.) Expected output: `1 passed`. On failure, open `playwright-report/index.html` and inspect the trace; do not assert on `getByRole('alert')`.

- [ ] **Step 50: Gitignore the e2e DB artifact.** Command: `grep -qxF "data/e2e.db" .gitignore || printf '\ndata/e2e.db\n' >> .gitignore`. Expected output: `data/e2e.db` present in `.gitignore` (the `data/` SQLite files are already gitignored per the repo convention, but pin this artifact explicitly).

- [ ] **Step 51: Full lint + typecheck + build before commit.** Command: `pnpm exec tsc --noEmit && pnpm lint && pnpm build`. Expected output: all three green.

- [ ] **Step 52: Commit.** Command:

```bash
git add -A && git commit -m "test(e2e): scaffold Playwright + add-expense appears in list and updates dashboard

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Expected output: one commit adding `playwright.config.ts`, `e2e/add-expense.spec.ts`, the `package.json` script, the `.gitignore` line, and any login a11y fix from Step 46.

### Critical Files for Implementation
- /Users/nanda/vibe-code/outlay/src/components/expenses/expense-list.tsx
- /Users/nanda/vibe-code/outlay/src/components/expenses/expense-row.tsx (new)
- /Users/nanda/vibe-code/outlay/src/components/expenses/swipe-threshold.ts (new)
- /Users/nanda/vibe-code/outlay/src/components/expenses/swipe-threshold.test.ts (new)
- /Users/nanda/vibe-code/outlay/src/components/expenses/expense-form.tsx
- /Users/nanda/vibe-code/outlay/src/components/expenses/add-expense-sheet.tsx (new)
- /Users/nanda/vibe-code/outlay/src/components/expenses/category-icon.tsx
- /Users/nanda/vibe-code/outlay/src/app/(app)/expenses/page.tsx
- /Users/nanda/vibe-code/outlay/src/components/ui/sheet.tsx
- /Users/nanda/vibe-code/outlay/src/components/ui/avatar.tsx
- /Users/nanda/vibe-code/outlay/playwright.config.ts (new)
- /Users/nanda/vibe-code/outlay/e2e/add-expense.spec.ts (new)
