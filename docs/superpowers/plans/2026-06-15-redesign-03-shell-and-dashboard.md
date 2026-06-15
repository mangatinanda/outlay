# Redesign M2+M3 — App Shell & Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the app shell (page transitions, sidebar, mobile bottom nav with sliding pill + FAB, header) and fully redesign the dashboard (hero card, stat chips, gradient area chart, donut, recent list).

**Architecture:** The (app) layout wraps content in PageTransition; the mobile nav uses a layoutId pill + elevated FAB; dashboard surfaces consume the M1 motion primitives and useFormatCurrency, with queries untouched.

**Tech Stack:** motion/react, Recharts 3, Tailwind v4 tokens, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`

---

## Conventions (canonical — read first)

- **Branch:** do all redesign work on a single `redesign/fresh-ledger` branch off `main` (not per-task branches). Commit after each green checkpoint.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the repo's established trailer).
- **Token utilities (Tailwind v4, defined in `src/app/globals.css` @theme):** use the NAMED utilities `shadow-card` / `shadow-float` / `shadow-pop` and `font-display` — not arbitrary `shadow-[var(--shadow-card)]` forms. Color via `bg-background`/`bg-card`/`bg-primary`/`text-foreground`/`text-muted-foreground`/`border-border`; radius via `rounded-2xl`/`rounded-3xl`; money via `tabular-nums`. No hardcoded hex/rgb/box-shadow in components.
- **Motion primitives (`src/components/motion/`, import from `motion/react`):** `PageTransition`, `AnimatedNumber({value, format, className})`, `Stagger` / `StaggerItem`, `MotionCard`. All honor `useReducedMotion()`. Reuse them — do not hand-roll bespoke `motion.div` variants on surfaces (shell chrome like the FAB/pill may use inline `motion` for layoutId, which is expected).
- **Invariants:** do NOT change `src/lib/queries/*` or `src/lib/actions/*` behavior/signatures or the props components receive — presentation + interaction only. next-themes stays; dark mode reaches parity via tokens. Restyle `src/components/ui/*` (Base UI/shadcn) via classes — do not fork. cva + `cn` for every component. lucide per-icon imports. Mobile: `env(safe-area-inset-bottom)`, ≥44px targets, no overflow at 390px. Respect `prefers-reduced-motion`; keep focus-visible rings; AA contrast.
- **Verification:** logic → vitest TDD; purely-visual → `pnpm exec tsc --noEmit` + `pnpm lint` + `pnpm build` + chrome-devtools screenshots at 1440×900 and 390×844 in light AND dark. Flows → `pnpm test:e2e`.
- **Sequencing:** **M2+M3** — hard-requires M1 (motion primitives + tokens) and benefits from M0 (Biome/e2e). If `src/components/motion/*` or the `shadow-card`/`font-display`/indigo `--primary` tokens are missing, STOP — M1 has not landed.
- **Playwright already scaffolded in Plan 01.** The dashboard e2e here is a *spec file + assertions only* — do not re-scaffold Playwright. The dashboard hero must expose a stable selector `[data-slot="hero-total"]` (Plan 04's e2e depends on it).
---

This section restyles the app shell — desktop sidebar, mobile bottom nav, and header — and wraps `(app)` page content in the `PageTransition` primitive. These are almost entirely visual/interaction changes (no data, query, or Server Action edits); the only logic is the mobile nav's "is this item active?" derivation, which is pure and unit-testable, so the sliding-pill refactor gets a real test. Everything else is verified with tsc + lint + build + screenshots at desktop and mobile in light and dark.

> Prerequisites (from M1, should already be merged): the `motion` package is installed; `src/components/motion/page-transition.tsx` exports `PageTransition`; the Fresh Ledger tokens (indigo `--primary`, warm `--card`/`--muted`/`--accent`/`--border`, `--shadow-card`/`--shadow-float`, `--font-display`) exist in `src/app/globals.css`; and `useReducedMotion` is available from `motion/react`. This section consumes them and does not redefine them. Task 1 below verifies each prerequisite and, for the `motion` package specifically, includes a remediation install step so this section can still proceed if M1's install has not landed.

### Task 1: Confirm motion primitive + tokens are available

- [ ] **Step 1: Verify the `PageTransition` primitive exists with the expected export.** Run (`grep` is a system binary; do NOT prefix with `pnpm exec`):
  ```bash
  grep -nE "export function PageTransition|export const PageTransition" src/components/motion/page-transition.tsx
  ```
  Expected output: one matching line, e.g. `export function PageTransition(` (confirms M1 shipped the primitive this section imports). If this command errors with "No such file or directory" or prints nothing, stop — M1 is not merged and this section cannot proceed.

- [ ] **Step 2: Verify the `motion` package resolves; if not, install it pinned to the latest stable.** Run:
  ```bash
  node -e "require.resolve('motion/react'); console.log('motion/react OK')"
  ```
  Expected output: `motion/react OK`. If instead it throws `Cannot find module 'motion/react'`, M1's install has not landed — install it now (this resolves the latest stable release and pins the exact version into `package.json`; do NOT hardcode a version number):
  ```bash
  pnpm add motion@latest
  ```
  Then re-run the `node -e` check above and confirm it prints `motion/react OK` before continuing.

- [ ] **Step 3: Verify the indigo primary and shadow/display tokens exist (so token-only styling has something to resolve to).** Run:
  ```bash
  grep -nE -- "--shadow-card|--shadow-float|--font-display" src/app/globals.css
  ```
  Expected output: at least three matching lines (the `@theme inline` mappings and/or `:root` definitions). If this prints nothing, stop — M1's token work is not merged and the `shadow-[var(--shadow-card)]` / `shadow-[var(--shadow-float)]` / `font-display` references in this section would resolve to nothing.

### Task 2: Wrap (app) content in PageTransition

- [ ] **Step 1: Modify the `(app)` layout to wrap `children` in `PageTransition` and thread `householdName` into `Header`.** This is the only change to the layout — the data fetching, providers, sidebar/header/mobile-nav structure, and `force-dynamic` stay exactly as they are. The `households` schema has `name` and `currency` columns, and `getCurrentHousehold()` returns the full row, so `household?.name` and `household?.currency` are valid.

  Files:
  - Modify: `src/app/(app)/layout.tsx`

  Full file:
  ```tsx
  import { Sidebar } from "@/components/layout/sidebar";
  import { Header } from "@/components/layout/header";
  import { MobileNav } from "@/components/layout/mobile-nav";
  import { PageTransition } from "@/components/motion/page-transition";
  import { CurrencyProvider } from "@/components/providers/currency-provider";
  import { HouseholdProvider } from "@/components/providers/household-provider";
  import { getCurrentHousehold, listHouseholds } from "@/lib/queries/household-queries";
  import { auth } from "@/auth";

  // These pages read from the database per request, so they must render
  // dynamically rather than being statically prerendered at build time (which
  // would require a populated database during the build / CI).
  export const dynamic = "force-dynamic";

  export default async function AppLayout({
    children,
  }: {
    children: React.ReactNode;
  }) {
    const [household, householdList, session] = await Promise.all([
      getCurrentHousehold(),
      listHouseholds(),
      auth(),
    ]);

    return (
      <HouseholdProvider
        households={householdList.map((h) => ({ id: h.id, name: h.name }))}
        currentId={household?.id ?? null}
      >
        <CurrencyProvider currency={household?.currency ?? "INR"}>
          <div className="min-h-screen bg-background">
            <Sidebar />
            <div className="md:pl-64">
              <Header
                user={session?.user ?? null}
                householdName={household?.name ?? null}
              />
              <main className="p-4 md:p-6 pb-24 md:pb-6">
                <PageTransition>{children}</PageTransition>
              </main>
            </div>
            <MobileNav />
          </div>
        </CurrencyProvider>
      </HouseholdProvider>
    );
  }
  ```
  Note: this threads `householdName` into `Header` (consumed in the header task below). `Header`'s prop type is widened in that task; complete the Header task before running the cross-cutting tsc in its Step 2, or tsc here will report `householdName` is not a valid `Header` prop.

- [ ] **Step 2: Type-check (expect one known error until the Header task lands).** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: clean (exit 0) IF the Header task is already done; otherwise the only error should be that `householdName` is not assignable to `Header`'s props. If you see that single error, complete the Header task next and re-run; any other error must be fixed here.

### Task 3: Restyle the desktop sidebar with a soft indigo active pill

- [ ] **Step 1: Restyle the sidebar active/inactive states and surfaces using token utilities only.** The active item becomes a soft indigo pill (`bg-primary/10 text-primary`) rather than a solid fill; inactive items get a warm hover; the brand mark gains `font-display` and the `--shadow-card` elevation. No nav items, hrefs, or the `inSheet` behavior change.

  Files:
  - Modify: `src/components/layout/sidebar.tsx`

  Full file:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import {
    LayoutDashboard,
    Receipt,
    Tags,
    Users,
    Settings,
    Home,
    Building2,
  } from "lucide-react";
  import { cn } from "@/lib/utils";
  import { ThemeToggle } from "./theme-toggle";
  import { HouseholdSwitcher } from "./household-switcher";

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/categories", label: "Categories", icon: Tags },
    { href: "/members", label: "Members", icon: Users },
    { href: "/households", label: "Households", icon: Building2 },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  export function Sidebar({ inSheet = false }: { inSheet?: boolean }) {
    const pathname = usePathname();

    return (
      <aside
        className={cn(
          "flex-col bg-card",
          inSheet
            ? // inside the mobile drawer: a visible, full-height flex column
              "flex h-full w-full"
            : // desktop: a fixed left sidebar, hidden below md
              "hidden border-r border-border md:flex md:w-64 md:fixed md:inset-y-0"
        )}
      >
        <div className="flex items-center gap-2 px-6 h-16 border-b border-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
            <Home className="h-4 w-4" />
          </div>
          <span className="text-lg font-bold font-display tracking-tight">Outlay</span>
        </div>

        <div className="px-3 py-3 border-b border-border">
          <HouseholdSwitcher />
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-border">
          <ThemeToggle />
        </div>
      </aside>
    );
  }
  ```

- [ ] **Step 2: Type-check.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no new errors from `sidebar.tsx` (exit 0, aside from the known transient `householdName` error from the layout task if Header is not yet done).

### Task 4: Extract the mobile-nav active-item logic and unit-test it

The "which item is active" rule (exact-match for `/expenses/new`, prefix-match otherwise) is real, pure logic that the sliding-pill refactor relies on (the pill renders inside the active item). It is a plain string function, so it runs under vitest's `node` environment (the repo's `vitest.config.ts` sets `environment: "node"` and `include: ["src/**/*.test.ts"]`, which matches a `.test.ts` colocated in `src/components/layout/`). Extract it to a pure helper and lock it with a test before touching the markup.

- [ ] **Step 1: Write the failing test for the active-item helper.** This test imports a helper that does not exist yet.

  Files:
  - Create: `src/components/layout/mobile-nav.test.ts`

  Full file:
  ```ts
  import { describe, expect, it } from "vitest";
  import { isNavItemActive } from "./mobile-nav-active";

  describe("isNavItemActive", () => {
    it("matches the Add item only on the exact /expenses/new path", () => {
      expect(isNavItemActive("/expenses/new", "/expenses/new")).toBe(true);
      expect(isNavItemActive("/expenses/new", "/expenses")).toBe(false);
      expect(isNavItemActive("/expenses/new", "/expenses/123")).toBe(false);
    });

    it("prefix-matches non-Add items", () => {
      expect(isNavItemActive("/expenses", "/expenses")).toBe(true);
      expect(isNavItemActive("/expenses", "/expenses/123")).toBe(true);
      expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
      expect(isNavItemActive("/categories", "/dashboard")).toBe(false);
    });

    it("does not let /expenses swallow the /expenses/new route check", () => {
      // On /expenses/new, the /expenses item is still prefix-active (expected),
      // but the /expenses/new item is exact-active.
      expect(isNavItemActive("/expenses", "/expenses/new")).toBe(true);
      expect(isNavItemActive("/expenses/new", "/expenses/new")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run the test and watch it fail.** Run:
  ```bash
  pnpm exec vitest run src/components/layout/mobile-nav.test.ts
  ```
  Expected output: the run fails to resolve the import — `Failed to load url ./mobile-nav-active` (or `Cannot find module`). This confirms the test executes and the helper is genuinely missing.

- [ ] **Step 3: Create the helper with the minimal implementation.**

  Files:
  - Create: `src/components/layout/mobile-nav-active.ts`

  Full file:
  ```ts
  /**
   * Decides whether a bottom-nav item is the active one for the current path.
   * The "Add" item (/expenses/new) matches only on an exact path so that it
   * isn't lit up while browsing the expenses list; every other item matches by
   * prefix.
   */
  export function isNavItemActive(href: string, pathname: string): boolean {
    if (href === "/expenses/new") {
      return pathname === "/expenses/new";
    }
    return pathname.startsWith(href);
  }
  ```

- [ ] **Step 4: Run the test and watch it pass.** Run:
  ```bash
  pnpm exec vitest run src/components/layout/mobile-nav.test.ts
  ```
  Expected output: `1 passed` test file, `3 passed` tests, exit 0.

- [ ] **Step 5: Commit the extracted, tested helper.** Run:
  ```bash
  git add src/components/layout/mobile-nav-active.ts src/components/layout/mobile-nav.test.ts && git commit -m "$(cat <<'EOF'
  refactor(layout): extract + test mobile-nav active-item logic

  Pull the active-item rule out of MobileNav into a pure helper so the
  sliding-pill restyle can rely on it. No behavior change.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```
  Expected output: a commit is created reporting `2 files changed`.

### Task 5: Restyle the mobile bottom nav (sliding pill, elevated FAB, safe-area, ≥44px)

- [ ] **Step 1: Rewrite `MobileNav` to use the tested helper, a `layoutId` sliding pill, an elevated indigo FAB with a `whileTap` spring, safe-area padding, and ≥44px targets — all degrading under reduced motion.** Same 5 items, same hrefs, same FAB position; Households/Settings stay out of the bar. The container gets `env(safe-area-inset-bottom)` padding; each item is a ≥44px tap target; the active non-FAB item renders a shared-`layoutId` pill behind it so it slides between items. The FAB uses `whileTap` directly on a `motion.span` (the FAB is its own element, not a card).

  Files:
  - Modify: `src/components/layout/mobile-nav.tsx`
  - Uses: `src/components/layout/mobile-nav-active.ts` (the tested helper)

  Full file:
  ```tsx
  "use client";

  import Link from "next/link";
  import { usePathname } from "next/navigation";
  import { motion, useReducedMotion } from "motion/react";
  import {
    LayoutDashboard,
    Receipt,
    PlusCircle,
    Tags,
    Users,
  } from "lucide-react";
  import { cn } from "@/lib/utils";
  import { isNavItemActive } from "./mobile-nav-active";

  const navItems = [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/expenses", label: "Expenses", icon: Receipt },
    { href: "/expenses/new", label: "Add", icon: PlusCircle },
    { href: "/categories", label: "Categories", icon: Tags },
    { href: "/members", label: "Members", icon: Users },
  ];

  export function MobileNav() {
    const pathname = usePathname();
    const reduceMotion = useReducedMotion();

    return (
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch justify-around h-16 px-2">
          {navItems.map((item) => {
            const isActive = isNavItemActive(item.href, pathname);
            const isAdd = item.href === "/expenses/new";

            if (isAdd) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className="relative -top-3 flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-2 text-xs text-muted-foreground"
                >
                  <motion.span
                    whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-float)]"
                  >
                    <item.icon className="h-6 w-6" />
                  </motion.span>
                  <span className="mt-1">{item.label}</span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobile-nav-pill"
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 500, damping: 35 }
                    }
                    className="absolute inset-x-1 top-1 bottom-1 -z-10 rounded-xl bg-primary/10"
                  />
                )}
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }
  ```

- [ ] **Step 2: Type-check.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors from `mobile-nav.tsx` (exit 0, aside from the known transient `householdName` error from the layout task if Header is not yet done).

### Task 6: Restyle the header (greeting + household name + avatar)

- [ ] **Step 1: Add a `householdName` prop and a greeting block to the header.** The header keeps the mobile drawer trigger, theme toggle, and the avatar dropdown (and its `logout` action from `@/lib/actions/auth-actions`) exactly as-is. It gains a left-side greeting + household-name block and `font-display` on the greeting. The time-of-day helper is named `greeting` (pure, inline); `firstName` and `initials` are the other inline helpers — no data/action changes.

  Files:
  - Modify: `src/components/layout/header.tsx`
  - Consumed by: `src/app/(app)/layout.tsx` (passes `householdName`, done in the PageTransition task)

  Full file:
  ```tsx
  "use client";

  import { Menu, LogOut, Settings } from "lucide-react";
  import Link from "next/link";
  import { Button } from "@/components/ui/button";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "@/components/ui/dropdown-menu";
  import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
  import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
  import { Sidebar } from "./sidebar";
  import { ThemeToggle } from "./theme-toggle";
  import { logout } from "@/lib/actions/auth-actions";

  export interface HeaderUser {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }

  function initials(user: HeaderUser | null) {
    return (user?.name || user?.email || "Guest").slice(0, 2).toUpperCase();
  }

  function greeting(date = new Date()) {
    const hour = date.getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }

  function firstName(user: HeaderUser | null) {
    const name = user?.name?.trim();
    if (name) return name.split(" ")[0];
    return null;
  }

  export function Header({
    user,
    householdName,
  }: {
    user: HeaderUser | null;
    householdName?: string | null;
  }) {
    const name = firstName(user);

    return (
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex items-center justify-between h-16 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet>
                <SheetTrigger render={<Button variant="ghost" size="icon" />}>
                  <Menu className="h-5 w-5" />
                </SheetTrigger>
                <SheetContent side="left" className="w-64 p-0">
                  <Sidebar inSheet />
                </SheetContent>
              </Sheet>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold font-display leading-tight">
                {greeting()}
                {name ? `, ${name}` : ""}
              </p>
              <p className="truncate text-xs text-muted-foreground leading-tight">
                {householdName ?? "Outlay"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger className="relative h-9 w-9 rounded-full cursor-pointer">
                <Avatar className="h-9 w-9">
                  {user?.image && <AvatarImage src={user.image} alt={user.name ?? ""} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials(user)}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.name ?? "Guest"}</p>
                      <p className="text-xs text-muted-foreground">
                        {user?.email ?? "Signed in with passcode"}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/settings" />}>
                  <Settings className="h-4 w-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <form action={logout}>
                  <button
                    type="submit"
                    className="flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-destructive outline-hidden hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </form>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    );
  }
  ```
  Note: the old desktop-only `Outlay` wordmark next to the mobile menu and the `<div className="hidden md:block" />` spacer are intentionally replaced by the greeting block, which is visible on all breakpoints (the desktop sidebar already carries the wordmark).

- [ ] **Step 2: Type-check the whole shell together.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors at all (exit 0). With Header now accepting `householdName`, the transient layout error from the PageTransition task must be gone; if any error remains, fix it before continuing.

### Task 7: Verify the app shell (lint, build, screenshots, eyeball)

This whole section is presentation/interaction; there is no further meaningful unit test beyond the active-item helper already covered. Verification is the full unit suite + tsc + lint + build + screenshots at desktop 1440x900 and mobile 390x844 in light and dark, plus a programmatic no-overflow check, a reduced-motion check, and a manual eyeball checklist.

- [ ] **Step 1: Run the unit suite (confirms nothing regressed).** Run:
  ```bash
  pnpm test
  ```
  Expected output: all test files pass, exit 0 (includes the new `src/components/layout/mobile-nav.test.ts`).

- [ ] **Step 2: Lint.** Run:
  ```bash
  pnpm lint
  ```
  Expected output: no errors, exit 0.

- [ ] **Step 3: Production build.** Run:
  ```bash
  pnpm build
  ```
  Expected output: build completes with exit 0 and no type or lint failures.

- [ ] **Step 4: Start the dev server in the background for screenshots.** Run:
  ```bash
  pnpm dev
  ```
  Expected output: the server logs a ready line with a local URL (e.g. `http://localhost:3000`). Leave it running for the screenshot steps.

- [ ] **Step 5: Capture desktop light + dark screenshots of `/dashboard`.** Using the chrome-devtools tools: `resize_page` to 1440x900, `navigate_page` to `http://localhost:3000/dashboard` (authenticate via passcode if redirected to `/login`), then `take_screenshot`. Toggle the theme via the header theme toggle and `take_screenshot` again. Expected: two desktop screenshots, one light, one dark.

- [ ] **Step 6: Capture mobile light + dark screenshots of `/dashboard` and `/expenses`.** `resize_page` to 390x844, `navigate_page` to `/dashboard`, `take_screenshot`; navigate to `/expenses`, `take_screenshot`; toggle dark (via the avatar/menu theme-toggle path on mobile) and repeat. Expected: mobile screenshots in both themes showing the bottom nav.

- [ ] **Step 7: Programmatically confirm no horizontal overflow at 390px.** With the page sized to 390x844 (from Step 6) and `/dashboard` loaded, use the chrome-devtools `evaluate_script` tool to evaluate:
  ```js
  () => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, overflow: el.scrollWidth > el.clientWidth };
  }
  ```
  Expected: `overflow` is `false` (i.e. `scrollWidth <= clientWidth`). Repeat on `/expenses`. If `overflow` is `true`, find and fix the overflowing element before continuing.

- [ ] **Step 8: Eyeball the following specifics against the screenshots and the live page:**
  - Desktop sidebar: the active route shows a soft indigo pill (`bg-primary/10`, indigo text), not a solid indigo fill; inactive items are muted with a warm hover.
  - Mobile bottom nav: the active-item pill is visible behind the active item and slides when you tap between Home / Expenses / Categories / Members; the center Add FAB is an elevated indigo circle and visibly springs (scales down) on tap.
  - Mobile bottom nav clears the home indicator (there is `env(safe-area-inset-bottom)` breathing room below the bar).
  - Every bottom-nav tap target is at least 44px tall (the row is `h-16` and items are `min-h-[44px]`).
  - Header shows the greeting + household name on the left and the avatar on the right; the mobile menu (hamburger) still opens the sidebar drawer; theme toggle still works; the avatar dropdown still lists Settings and Sign out.
  - Route changes fade/slide via `PageTransition` (navigate Dashboard → Expenses).
  - Both light and dark look intentional; no flash on load.

- [ ] **Step 9: Verify reduced-motion degrades cleanly.** With the chrome-devtools `emulate` tool, emulate `prefers-reduced-motion: reduce`, reload `/dashboard`, then tap between bottom-nav items and the FAB. Expected: the pill jumps instantly (no spring), the FAB does not animate scale, and navigation still works — confirming `useReducedMotion` is honored.

- [ ] **Step 10: Stop the dev server.** Terminate the backgrounded `pnpm dev` process. Expected: the server shuts down.

- [ ] **Step 11: Commit the app-shell restyle.** Run:
  ```bash
  git add "src/app/(app)/layout.tsx" src/components/layout/sidebar.tsx src/components/layout/mobile-nav.tsx src/components/layout/header.tsx && git commit -m "$(cat <<'EOF'
  feat(ui): Fresh Ledger app shell — sidebar, mobile nav, header, transitions

  Wrap (app) content in PageTransition. Sidebar gains a soft indigo active
  pill; mobile bottom nav gets a sliding layoutId pill, an elevated indigo
  FAB with a whileTap spring, safe-area-inset-bottom padding, and >=44px
  targets; header shows greeting + household name + avatar. Token-only
  styling, reduced-motion respected. No route/data/action changes.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```
  Expected output: a commit is created reporting `4 files changed`.

### Critical Files for Implementation
- /Users/nanda/vibe-code/outlay/src/app/(app)/layout.tsx
- /Users/nanda/vibe-code/outlay/src/components/layout/mobile-nav.tsx
- /Users/nanda/vibe-code/outlay/src/components/layout/mobile-nav-active.ts
- /Users/nanda/vibe-code/outlay/src/components/layout/mobile-nav.test.ts
- /Users/nanda/vibe-code/outlay/src/components/layout/sidebar.tsx
- /Users/nanda/vibe-code/outlay/src/components/layout/header.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/page-transition.tsx

Dashboard redesign converts the four flat summary tiles into a hero "spent this month" card plus soft stat chips, swaps the daily-spending bar chart for a gradient area chart with a friendly empty state, restyles the donut and recent-expenses list, and introduces the shared `AnimatedNumber` and `Stagger`/`StaggerItem` motion primitives this work depends on (props for all four dashboard components stay unchanged; `dashboard-queries.ts` is not touched). Money is rendered tabular (`tabular-nums`) throughout, and the count-up degrades to the final value under `prefers-reduced-motion: reduce`.

Facts confirmed against the codebase before drafting: there is no `src/components/motion/` directory yet; `useFormatCurrency` lives at `@/components/providers/currency-provider` with signature `(amount: number, options?: Intl.NumberFormatOptions) => string`; chart tokens `--chart-1..5` are wired through `@theme` (`--color-chart-1` etc.) so `bg-chart-1`, `text-chart-2`, and opacity modifiers like `bg-chart-2/15` all resolve; `src/app/globals.css` is 128 lines with the `@layer base { … }` block spanning lines 119-128; Vitest is `environment: "node"` with `include: ["src/**/*.test.ts"]`; the access gate (`src/proxy.ts`) accepts a Google session OR the shared passcode (`HOUSEHOLD_PASSCODE`); the passcode field is an `Input` with `name="passcode"` and `placeholder="Enter household passcode"` (no `<label>`) and the submit button reads "Unlock".

### Task 8: Add the count-up easing helper (TDD, pure logic)

> ⚠️ **`AnimatedNumber` and `Stagger`/`StaggerItem` are created in Plan 02 (M1), Tasks 5–9** — this dashboard section was drafted by a separate agent that assumed they didn't exist. Since M1 lands first (and Task 1 of this plan confirms they're present): **SKIP re-creating those primitives in Tasks 9–10 below**; import them from `@/components/motion`. Task 8's count-up easing helper is only needed if M1's `AnimatedNumber` did not already extract one — if M1's `AnimatedNumber` is self-contained, skip Task 8 too. Do not define a second copy of any motion primitive; M1 is the single source.

The only meaningfully testable logic in this section is the count-up interpolation. Extract it into a pure helper so it can be unit-tested under the Vitest `node` environment (no DOM), then consumed by `AnimatedNumber`.

- [ ] **Step 1: Write the failing test.** Create `src/components/motion/count-up.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { easeOutCubic, interpolateCountUp } from "./count-up";

  describe("easeOutCubic", () => {
    it("is 0 at t=0 and 1 at t=1", () => {
      expect(easeOutCubic(0)).toBe(0);
      expect(easeOutCubic(1)).toBe(1);
    });
    it("is front-loaded (past the midpoint by t=0.5)", () => {
      expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
    });
    it("clamps inputs below 0 and above 1", () => {
      expect(easeOutCubic(-1)).toBe(0);
      expect(easeOutCubic(2)).toBe(1);
    });
  });

  describe("interpolateCountUp", () => {
    it("returns the start value before any progress", () => {
      expect(interpolateCountUp(100, 200, 0)).toBe(100);
    });
    it("returns the end value at full progress", () => {
      expect(interpolateCountUp(100, 200, 1)).toBe(200);
    });
    it("clamps progress above 1 to the end value", () => {
      expect(interpolateCountUp(0, 50, 1.5)).toBe(50);
    });
    it("counts down when end < start", () => {
      expect(interpolateCountUp(200, 100, 1)).toBe(100);
    });
  });
  ```

- [ ] **Step 2: Run the test, see it fail.** Run:
  ```
  pnpm test src/components/motion/count-up.test.ts
  ```
  Expected output: the run fails because `./count-up` cannot be resolved (module not found) — this confirms the test is wired up and the implementation is missing.

- [ ] **Step 3: Write the minimal implementation.** Create `src/components/motion/count-up.ts`:
  ```ts
  /** Ease-out cubic: fast start, gentle settle. Inputs are clamped to [0, 1]. */
  export function easeOutCubic(t: number): number {
    const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
    return 1 - Math.pow(1 - clamped, 3);
  }

  /**
   * Interpolates from `start` to `end` by linear `progress` (0..1), applying
   * an ease-out cubic. Progress is clamped, so values past 1 land exactly on `end`.
   */
  export function interpolateCountUp(
    start: number,
    end: number,
    progress: number,
  ): number {
    const eased = easeOutCubic(progress);
    return start + (end - start) * eased;
  }
  ```

- [ ] **Step 4: Run the test, see it pass.** Run:
  ```
  pnpm test src/components/motion/count-up.test.ts
  ```
  Expected output: `2 passed` test files / all assertions in both `describe` blocks pass, no failures.

- [ ] **Step 5: Commit.** Run:
  ```
  git add src/components/motion/count-up.ts src/components/motion/count-up.test.ts && git commit -m "Add count-up easing helper with tests

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit created, two files changed.

### Task 9: Create the AnimatedNumber primitive (reduced-motion aware)

`AnimatedNumber` animates a numeric value from 0 to its target using `requestAnimationFrame` and `interpolateCountUp`, formatting each frame through a caller-supplied `format` function (so the dashboard passes `useFormatCurrency()`). It degrades to the final value instantly when `prefers-reduced-motion: reduce` is set. This is a purely visual primitive — the animation itself has no unit test; correctness of the interpolation is covered by the helper test above and the rendered output is verified visually in the dashboard tasks.

- [ ] **Step 1: Create the component.** Create `src/components/motion/animated-number.tsx`:
  ```tsx
  "use client";

  import { useEffect, useRef, useState } from "react";
  import { interpolateCountUp } from "./count-up";

  interface AnimatedNumberProps {
    /** The target value to count up to. */
    value: number;
    /** Formats each intermediate frame, e.g. a bound currency formatter. */
    format: (value: number) => string;
    /** Count-up duration in ms. Ignored under reduced motion. */
    durationMs?: number;
    className?: string;
  }

  function usePrefersReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);
    useEffect(() => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }, []);
    return reduced;
  }

  export function AnimatedNumber({
    value,
    format,
    durationMs = 900,
    className,
  }: AnimatedNumberProps) {
    const reduced = usePrefersReducedMotion();
    const [display, setDisplay] = useState(value);
    const fromRef = useRef(0);

    useEffect(() => {
      if (reduced) {
        setDisplay(value);
        fromRef.current = value;
        return;
      }
      const from = fromRef.current;
      const start = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const progress = (now - start) / durationMs;
        setDisplay(interpolateCountUp(from, value, progress));
        if (progress < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          fromRef.current = value;
        }
      };
      raf = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(raf);
    }, [value, durationMs, reduced]);

    return (
      <span className={className} aria-label={format(value)}>
        {format(display)}
      </span>
    );
  }
  ```

- [ ] **Step 2: Typecheck.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 3: Commit.** Run:
  ```
  git add src/components/motion/animated-number.tsx && git commit -m "Add AnimatedNumber motion primitive

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 10: Create the Stagger / StaggerItem primitives (reduced-motion aware)

`Stagger` is a container that reveals its `StaggerItem` children one after another by assigning each an increasing CSS `animation-delay`; `StaggerItem` fades and rises into place. Under reduced motion the keyframe animation is disabled so children render fully visible with no transform. Purely visual — no unit test; verified in the dashboard tasks.

- [ ] **Step 1: Add the keyframe utility to globals.css.** Modify `src/app/globals.css`, appending the following at the END of the file (immediately after the closing `}` of the `@layer base { … }` block, which currently ends at line 128):
  ```css
  @layer utilities {
    @keyframes stagger-rise {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .animate-stagger-rise {
      animation: stagger-rise 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @media (prefers-reduced-motion: reduce) {
      .animate-stagger-rise {
        animation: none;
      }
    }
  }
  ```

- [ ] **Step 2: Create the primitives.** Create `src/components/motion/stagger.tsx`:
  ```tsx
  "use client";

  import { Children, cloneElement, isValidElement } from "react";
  import type { CSSProperties, ReactElement, ReactNode } from "react";
  import { cn } from "@/lib/utils";

  interface StaggerProps {
    children: ReactNode;
    /** Delay added per child, in ms. */
    stepMs?: number;
    className?: string;
  }

  /** Wraps children, assigning each StaggerItem an increasing animation delay. */
  export function Stagger({ children, stepMs = 60, className }: StaggerProps) {
    return (
      <div className={className}>
        {Children.map(children, (child, i) => {
          if (!isValidElement(child)) return child;
          const el = child as ReactElement<{ style?: CSSProperties }>;
          return cloneElement(el, {
            style: { ...el.props.style, animationDelay: `${i * stepMs}ms` },
          });
        })}
      </div>
    );
  }

  interface StaggerItemProps {
    children: ReactNode;
    className?: string;
    style?: CSSProperties;
  }

  /** A single revealed item. Receives its delay via `style` from Stagger. */
  export function StaggerItem({ children, className, style }: StaggerItemProps) {
    return (
      <div className={cn("animate-stagger-rise", className)} style={style}>
        {children}
      </div>
    );
  }
  ```

- [ ] **Step 3: Typecheck.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 4: Commit.** Run:
  ```
  git add src/components/motion/stagger.tsx src/app/globals.css && git commit -m "Add Stagger and StaggerItem motion primitives

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, two files changed.

### Task 11: Redesign summary cards into hero + soft stat chips

Replace the four uniform tiles with a hero "This Month" card (indigo gradient, `AnimatedNumber` count-up, MoM pill) and three soft stat chips with colored icon tiles entering via `Stagger`/`StaggerItem`. Props (`stats`) and the exported name `SummaryCards` are unchanged. Money is tabular. Purely visual — no unit test.

- [ ] **Step 1: Rewrite the component.** Replace the entire contents of `src/components/dashboard/summary-cards.tsx` with:
  ```tsx
  "use client";

  import { Card, CardContent } from "@/components/ui/card";
  import {
    CalendarDays,
    Minus,
    Receipt,
    TrendingDown,
    TrendingUp,
  } from "lucide-react";
  import { useFormatCurrency } from "@/components/providers/currency-provider";
  import { AnimatedNumber } from "@/components/motion/animated-number";
  import { Stagger, StaggerItem } from "@/components/motion/stagger";
  import { cn } from "@/lib/utils";

  interface SummaryCardsProps {
    stats: {
      monthTotal: number;
      monthCount: number;
      prevMonthTotal: number;
      dailyAverage: number;
      monthChange: number;
    };
  }

  export function SummaryCards({ stats }: SummaryCardsProps) {
    const formatCurrency = useFormatCurrency();
    const hasBaseline = stats.prevMonthTotal > 0;
    const up = stats.monthChange > 0;
    const PillIcon = !hasBaseline ? Minus : up ? TrendingUp : TrendingDown;

    const chips = [
      {
        title: "Daily Average",
        value: formatCurrency(stats.dailyAverage),
        caption: "Average per day this month",
        icon: CalendarDays,
        tile: "bg-chart-2/15 text-chart-2",
      },
      {
        title: "Transactions",
        value: stats.monthCount.toString(),
        caption: "Expenses this month",
        icon: Receipt,
        tile: "bg-chart-1/20 text-chart-1",
      },
      {
        title: "Last Month",
        value: formatCurrency(stats.prevMonthTotal),
        caption: "Total spending",
        icon: stats.monthChange <= 0 ? TrendingDown : TrendingUp,
        tile: "bg-chart-4/15 text-chart-4",
      },
    ];

    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden bg-gradient-to-br from-chart-4 to-chart-3 text-white ring-0 lg:col-span-1">
          <CardContent className="flex h-full flex-col justify-between gap-6 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white/80">This Month</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium">
                <PillIcon className="h-3.5 w-3.5" aria-hidden />
                {hasBaseline
                  ? `${up ? "+" : ""}${stats.monthChange.toFixed(1)}% MoM`
                  : "No baseline"}
              </span>
            </div>
            <AnimatedNumber
              value={stats.monthTotal}
              format={(v) => formatCurrency(v)}
              className="text-4xl font-bold tracking-tight tabular-nums"
            />
            <span className="text-xs text-white/70">
              {hasBaseline
                ? "Compared with last month"
                : "No spending recorded last month"}
            </span>
          </CardContent>
        </Card>

        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-2">
          {chips.map((chip) => (
            <StaggerItem key={chip.title}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      chip.tile,
                    )}
                  >
                    <chip.icon className="h-4 w-4" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      {chip.title}
                    </p>
                    <p className="text-2xl font-bold tabular-nums">{chip.value}</p>
                    <p className="text-xs text-muted-foreground">{chip.caption}</p>
                  </div>
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    );
  }
  ```

- [ ] **Step 2: Typecheck.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 3: Lint.** Run:
  ```
  pnpm lint
  ```
  Expected output: no errors or warnings for `summary-cards.tsx`.

- [ ] **Step 4: Commit.** Run:
  ```
  git add src/components/dashboard/summary-cards.tsx && git commit -m "Redesign summary cards into hero + stat chips

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 12: Convert daily-spending chart to a gradient area chart with empty state

Swap the Recharts `BarChart` for a gradient-filled `AreaChart`, using token-based chart colors (`var(--chart-3)`). When every total in `data` is 0, render a friendly empty state instead of an empty chart. Props (`data`) and exported name `ExpenseChart` are unchanged. Purely visual — no unit test.

- [ ] **Step 1: Rewrite the component.** Replace the entire contents of `src/components/dashboard/expense-chart.tsx` with:
  ```tsx
  "use client";

  import {
    Area,
    AreaChart,
    CartesianGrid,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } from "recharts";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import { useFormatCurrency } from "@/components/providers/currency-provider";
  import { format, parseISO } from "date-fns";
  import { LineChart as LineChartIcon } from "lucide-react";

  interface ExpenseChartProps {
    data: { date: string; total: number }[];
  }

  export function ExpenseChart({ data }: ExpenseChartProps) {
    const formatCurrency = useFormatCurrency();
    const isEmpty = data.every((d) => d.total === 0);
    const chartData = data.map((d) => ({
      ...d,
      label: format(parseISO(d.date), "MMM d"),
    }));

    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Spending</CardTitle>
          <CardDescription>Your spending over the last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <div className="flex h-[300px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
                <LineChartIcon className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-sm font-medium">No spending yet this month</p>
              <p className="text-xs text-muted-foreground">
                Your daily spending will appear here once you add expenses.
              </p>
            </div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData}
                  margin={{ top: 8, right: 4, left: -8, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="dailySpendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    className="text-xs fill-muted-foreground"
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v) =>
                      formatCurrency(Number(v), {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })
                    }
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border bg-card p-2 shadow-sm">
                          <div className="text-sm font-medium tabular-nums">
                            {formatCurrency(Number(payload[0].value))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {payload[0].payload.label}
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    fill="url(#dailySpendFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 2: Typecheck.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 3: Lint.** Run:
  ```
  pnpm lint
  ```
  Expected output: no errors or warnings for `expense-chart.tsx`.

- [ ] **Step 4: Commit.** Run:
  ```
  git add src/components/dashboard/expense-chart.tsx && git commit -m "Convert daily-spending chart to gradient area chart with empty state

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 13: Restyle the category donut with percentage chips

Keep the donut, restyle the legend so each row shows the category color dot, name, tabular amount, and a soft `%` chip. Add a friendly empty state when there is no data (total is 0). Props (`data`) and exported name `CategoryPieChart` are unchanged. Purely visual — no unit test.

- [ ] **Step 1: Rewrite the component.** Replace the entire contents of `src/components/dashboard/category-pie-chart.tsx` with:
  ```tsx
  "use client";

  import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import { useFormatCurrency } from "@/components/providers/currency-provider";
  import { PieChart as PieChartIcon } from "lucide-react";

  interface CategoryPieChartProps {
    data: { name: string; color: string; total: number; count: number }[];
  }

  export function CategoryPieChart({ data }: CategoryPieChartProps) {
    const formatCurrency = useFormatCurrency();
    const total = data.reduce((sum, d) => sum + d.total, 0);
    const isEmpty = total === 0;

    return (
      <Card>
        <CardHeader>
          <CardTitle>By Category</CardTitle>
          <CardDescription>Spending breakdown this month</CardDescription>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-chart-2/15 text-chart-2">
                <PieChartIcon className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-sm font-medium">No categories yet</p>
              <p className="text-xs text-muted-foreground">
                Add expenses to see how your spending breaks down.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 lg:flex-row">
              <div className="h-[200px] w-[200px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {data.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="rounded-lg border bg-card p-2 shadow-sm">
                            <div className="text-sm font-medium">{d.name}</div>
                            <div className="text-xs text-muted-foreground tabular-nums">
                              {formatCurrency(d.total)} ({d.count} expenses)
                            </div>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full flex-1 space-y-2">
                {data.slice(0, 6).map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="truncate">{item.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-medium tabular-nums">
                        {formatCurrency(item.total)}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                        {((item.total / total) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 2: Typecheck.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 3: Lint.** Run:
  ```
  pnpm lint
  ```
  Expected output: no errors or warnings for `category-pie-chart.tsx`.

- [ ] **Step 4: Commit.** Run:
  ```
  git add src/components/dashboard/category-pie-chart.tsx && git commit -m "Restyle category donut legend with percentage chips and empty state

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 14: Restyle the recent-expenses list with category chips

Refresh the row layout: rounded hover surface, category name shown as a soft chip tinted with the category color, tabular money. Reuse the existing `CategoryIcon` and the existing "View all" `Button` (rendered as a `Link` via `nativeButton={false}` / `render`, matching the current file). Props (`expenses`) and exported name `RecentExpenses` are unchanged. Purely visual — no unit test.

- [ ] **Step 1: Rewrite the component.** Replace the entire contents of `src/components/dashboard/recent-expenses.tsx` with:
  ```tsx
  "use client";

  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from "@/components/ui/card";
  import { useFormatCurrency } from "@/components/providers/currency-provider";
  import { format, parseISO } from "date-fns";
  import Link from "next/link";
  import { Button } from "@/components/ui/button";
  import { ArrowRight } from "lucide-react";
  import { CategoryIcon } from "@/components/expenses/category-icon";

  interface RecentExpensesProps {
    expenses: {
      id: string;
      amount: number;
      description: string;
      date: string;
      categoryName: string;
      categoryIcon: string;
      categoryColor: string;
      memberName: string;
    }[];
  }

  export function RecentExpenses({ expenses }: RecentExpensesProps) {
    const formatCurrency = useFormatCurrency();

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Expenses</CardTitle>
            <CardDescription>Your latest transactions</CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/expenses" />}
          >
            View all <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CategoryIcon
                    icon={expense.categoryIcon}
                    color={expense.categoryColor}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium leading-none">
                      {expense.description}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className="rounded-full px-2 py-0.5 font-medium"
                        style={{
                          backgroundColor: `${expense.categoryColor}20`,
                          color: expense.categoryColor,
                        }}
                      >
                        {expense.categoryName}
                      </span>
                      <span>{expense.memberName}</span>
                      <span aria-hidden>&middot;</span>
                      <span>{format(parseISO(expense.date), "MMM d")}</span>
                    </div>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatCurrency(expense.amount)}
                </span>
              </div>
            ))}
            {expenses.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No expenses yet. Add your first expense!
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

- [ ] **Step 2: Typecheck.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 3: Lint.** Run:
  ```
  pnpm lint
  ```
  Expected output: no errors or warnings for `recent-expenses.tsx`.

- [ ] **Step 4: Commit.** Run:
  ```
  git add src/components/dashboard/recent-expenses.tsx && git commit -m "Restyle recent-expenses list with category chips

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 15: Full build verification

Run the full toolchain to confirm the redesigned dashboard typechecks, lints, tests, and builds before visual review.

- [ ] **Step 1: Typecheck the whole project.** Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 2: Lint the whole project.** Run:
  ```
  pnpm lint
  ```
  Expected output: no errors or warnings.

- [ ] **Step 3: Run the full unit-test suite.** Run:
  ```
  pnpm test
  ```
  Expected output: all suites pass, including `src/components/motion/count-up.test.ts`; the run does NOT pick up any `e2e/*.spec.ts` file (Vitest `include` is `src/**/*.test.ts`).

- [ ] **Step 4: Build.** Run:
  ```
  pnpm build
  ```
  Expected output: build completes successfully; the `/dashboard` route appears in the route summary with no compile errors.

### Task 16: Visual verification — seeded state (desktop + mobile, light + dark)

There is no meaningful unit test for these visual changes; verification is screenshots plus an explicit eyeball checklist. This task verifies the dashboard with seeded data present, at desktop 1440x900 and mobile 390x844, in both light and dark themes, using chrome-devtools.

- [ ] **Step 1: Ensure seeded data.** Run:
  ```
  pnpm db:init
  ```
  Expected output: migrations applied (`pnpm db:migrate`) and the sample household/expenses seeded (`pnpm db:seed`).

- [ ] **Step 2: Start the dev server.** Run in the background:
  ```
  pnpm dev
  ```
  Expected output: server ready on `http://localhost:3000`.

- [ ] **Step 3: Capture desktop light.** Using chrome-devtools: `resize_page` to 1440x900, `navigate_page` to `http://localhost:3000/dashboard` (if redirected to `/login`, fill the passcode field — placeholder "Enter household passcode" — with the configured `HOUSEHOLD_PASSCODE` and click "Unlock"), ensure the theme is light, then `take_screenshot`.

- [ ] **Step 4: Capture desktop dark.** Switch the theme to dark (toggle via the app's theme control, or `evaluate_script`: `localStorage.setItem('theme','dark')` then reload — next-themes reads this key), keep 1440x900, `take_screenshot`.

- [ ] **Step 5: Capture mobile light.** `resize_page` to 390x844, set theme to light (`localStorage.setItem('theme','light')`), reload `/dashboard`, `take_screenshot`.

- [ ] **Step 6: Capture mobile dark.** Keep 390x844, set theme to dark (`localStorage.setItem('theme','dark')`), reload, `take_screenshot`.

- [ ] **Step 7: Eyeball checklist.** Confirm across the four screenshots:
  - Hero card shows the indigo gradient (`from-chart-4 to-chart-3`), white text legible in both themes, the count-up settled on the correct "This Month" total, and a MoM pill (percentage with sign, or "No baseline").
  - The three stat chips show colored icon tiles (`bg-chart-2/15`, `bg-chart-1/20`, `bg-chart-4/15`) and align in a row on desktop; on mobile they stack to one column.
  - The daily-spending card is a gradient AREA chart (filled under the line via `url(#dailySpendFill)`), axes readable, money tabular in the tooltip.
  - The donut legend rows show a color dot, truncated name, tabular amount, and a `%` chip.
  - Recent-expenses rows show the tinted category chip, member, date, and right-aligned tabular amount; the rounded hover surface appears on desktop hover.
  - No layout overflow or clipped text at 390px width.

### Task 17: Visual verification — empty state (desktop + mobile, light + dark)

Verify the friendly empty states for a household with no current-month spending, at desktop 1440x900 and mobile 390x844, in both light and dark themes, using chrome-devtools.

- [ ] **Step 1: Reach an empty-month dataset.** With the dev server running and the gate passed, switch to (or create via `/households`) a household with no expenses this month so `getDashboardStats`, `getCategoryBreakdown`, and `getSpendingByDay` return zeros, then `navigate_page` to `http://localhost:3000/dashboard`.

- [ ] **Step 2: Capture desktop light.** `resize_page` to 1440x900, light theme, `take_screenshot`.

- [ ] **Step 3: Capture desktop dark.** 1440x900, dark theme (`localStorage.setItem('theme','dark')`, reload), `take_screenshot`.

- [ ] **Step 4: Capture mobile light.** `resize_page` to 390x844, light theme (`localStorage.setItem('theme','light')`, reload), `take_screenshot`.

- [ ] **Step 5: Capture mobile dark.** 390x844, dark theme (`localStorage.setItem('theme','dark')`, reload), `take_screenshot`.

- [ ] **Step 6: Eyeball checklist.** Confirm across the four screenshots:
  - Hero card shows `formatCurrency(0)` and the "No baseline" pill (with the `Minus` icon) plus the "No spending recorded last month" caption.
  - Daily-spending card shows the friendly empty state (circular icon tile + "No spending yet this month" + helper copy), not a blank/flat chart.
  - Donut card shows the "No categories yet" empty state, not a zero-area donut.
  - Recent-expenses card shows "No expenses yet. Add your first expense!".
  - Empty-state copy is centered and legible in both themes at both widths.

### Task 18: Add a Playwright smoke test that the dashboard renders after login

> ⚠️ **Playwright is already scaffolded in Plan 01 (M0).** Do NOT re-install `@playwright/test`, re-create `playwright.config.ts`, or re-add the `test:e2e` script — they exist. Use Plan 01's canonical config (Pixel-7 project, `baseURL http://localhost:3000`, webServer seeding `file:./data/e2e.db` with `HOUSEHOLD_PASSCODE`). Only **create and run the spec file** in this task, and ensure the dashboard hero exposes the stable selector `[data-slot="hero-total"]` (Plan 04's e2e depends on it).

Add one spec asserting the dashboard renders after passing the access gate, using the existing Plan 01 Playwright harness.

- [ ] **Step 1: Install Playwright (exact, latest stable from registry).** Run:
  ```
  pnpm add -DE @playwright/test && pnpm exec playwright install chromium
  ```
  Expected output: `@playwright/test` added to `devDependencies` pinned to an exact version (no `^`); the Chromium browser is downloaded. (On Linux CI, append `--with-deps` to the install command to pull OS libraries; it is omitted here because it requires sudo and is unnecessary on a local macOS dev machine.)

- [ ] **Step 2: Create the Playwright config.** Create `playwright.config.ts` at the repo root:
  ```ts
  import { defineConfig, devices } from "@playwright/test";

  export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    retries: 0,
    use: {
      baseURL: "http://localhost:3000",
      trace: "on-first-retry",
    },
    projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
    webServer: {
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  });
  ```

- [ ] **Step 3: Add the e2e script.** Modify `package.json` `scripts`, adding the following entry immediately after the `"test:watch": "vitest"` line:
  ```json
  "test:e2e": "playwright test",
  ```

- [ ] **Step 4: Write the smoke spec.** Create `e2e/dashboard.spec.ts`. The gate (`src/proxy.ts`) accepts a Google session OR the shared passcode; the passcode path is automatable. The passcode field is an `Input` with `name="passcode"` and `placeholder="Enter household passcode"` (no associated `<label>`, so target it by placeholder), and the submit button reads "Unlock". `E2E_PASSCODE` must be set to the same value as the server's `HOUSEHOLD_PASSCODE`.
  ```ts
  import { expect, test } from "@playwright/test";

  /**
   * Smoke: after passing the access gate (shared passcode), the dashboard
   * renders its core surfaces. Set E2E_PASSCODE in the environment to the
   * same value as the server's HOUSEHOLD_PASSCODE.
   */
  test("dashboard renders after login", async ({ page }) => {
    await page.goto("/dashboard");

    // If redirected to the gate, authenticate via the shared passcode.
    const passcode = page.getByPlaceholder("Enter household passcode");
    if (await passcode.isVisible().catch(() => false)) {
      await passcode.fill(process.env.E2E_PASSCODE ?? "");
      await page.getByRole("button", { name: "Unlock" }).click();
    }

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText("Dashboard").first()).toBeVisible();
    await expect(page.getByText("This Month")).toBeVisible();
    await expect(page.getByText("Daily Spending")).toBeVisible();
    await expect(page.getByText("Recent Expenses")).toBeVisible();
  });
  ```

- [ ] **Step 5: Confirm Playwright is scoped out of Vitest.** Vitest's `include` is `src/**/*.test.ts`, so `e2e/*.spec.ts` is already excluded. Verify by running:
  ```
  pnpm test
  ```
  Expected output: the unit suite passes and does NOT attempt to run `e2e/dashboard.spec.ts`.

- [ ] **Step 6: Run the smoke test.** With the gate passcode available, run:
  ```
  E2E_PASSCODE="$HOUSEHOLD_PASSCODE" pnpm test:e2e
  ```
  Expected output: `1 passed` — the dashboard URL is reached and the "This Month", "Daily Spending", and "Recent Expenses" surfaces are visible.

- [ ] **Step 7: Commit.** Run:
  ```
  git add playwright.config.ts e2e/dashboard.spec.ts package.json pnpm-lock.yaml && git commit -m "Add Playwright dashboard smoke test

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit; config, spec, package.json, and lockfile changed.

### Critical Files for Implementation
- /Users/nanda/vibe-code/outlay/src/components/motion/count-up.ts
- /Users/nanda/vibe-code/outlay/src/components/motion/count-up.test.ts
- /Users/nanda/vibe-code/outlay/src/components/motion/animated-number.tsx
- /Users/nanda/vibe-code/outlay/src/components/motion/stagger.tsx
- /Users/nanda/vibe-code/outlay/src/app/globals.css
- /Users/nanda/vibe-code/outlay/src/components/dashboard/summary-cards.tsx
- /Users/nanda/vibe-code/outlay/src/components/dashboard/expense-chart.tsx
- /Users/nanda/vibe-code/outlay/src/components/dashboard/category-pie-chart.tsx
- /Users/nanda/vibe-code/outlay/src/components/dashboard/recent-expenses.tsx
- /Users/nanda/vibe-code/outlay/playwright.config.ts
- /Users/nanda/vibe-code/outlay/e2e/dashboard.spec.ts
- /Users/nanda/vibe-code/outlay/package.json
