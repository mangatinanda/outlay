# Redesign M0 — Repo Hardening (Biome · typed-env · Playwright)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the ivm-pwa engineering practices that fit Outlay — replace ESLint with Biome, add a typed (zod) env module, and scaffold mobile-first Playwright e2e — before any visual redesign.

**Architecture:** Three independent, separately-committable changes. Biome lands first as an isolated reformat commit; typed-env centralizes env access with build-time-safe validation; Playwright scaffolds a Pixel-7 e2e harness with a temp seeded libSQL DB and passcode auth.

**Tech Stack:** Biome 2.x, zod (already present), @playwright/test, libSQL/Drizzle, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-15-ui-redesign-fresh-ledger-design.md`

---

## Conventions (canonical — read first)

- **Branch:** do all redesign work on a single `redesign/fresh-ledger` branch off `main` (not per-task branches). Commit after each green checkpoint.
- **Commit trailer:** every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (the repo's established trailer).
- **Token utilities (Tailwind v4, defined in `src/app/globals.css` @theme):** use the NAMED utilities `shadow-card` / `shadow-float` / `shadow-pop` and `font-display` — not arbitrary `shadow-[var(--shadow-card)]` forms. Color via `bg-background`/`bg-card`/`bg-primary`/`text-foreground`/`text-muted-foreground`/`border-border`; radius via `rounded-2xl`/`rounded-3xl`; money via `tabular-nums`. No hardcoded hex/rgb/box-shadow in components.
- **Motion primitives (`src/components/motion/`, import from `motion/react`):** `PageTransition`, `AnimatedNumber({value, format, className})`, `Stagger` / `StaggerItem`, `MotionCard`. All honor `useReducedMotion()`. Reuse them — do not hand-roll bespoke `motion.div` variants on surfaces (shell chrome like the FAB/pill may use inline `motion` for layoutId, which is expected).
- **Invariants:** do NOT change `src/lib/queries/*` or `src/lib/actions/*` behavior/signatures or the props components receive — presentation + interaction only. next-themes stays; dark mode reaches parity via tokens. Restyle `src/components/ui/*` (Base UI/shadcn) via classes — do not fork. cva + `cn` for every component. lucide per-icon imports. Mobile: `env(safe-area-inset-bottom)`, ≥44px targets, no overflow at 390px. Respect `prefers-reduced-motion`; keep focus-visible rings; AA contrast.
- **Verification:** logic → vitest TDD; purely-visual → `pnpm exec tsc --noEmit` + `pnpm lint` + `pnpm build` + chrome-devtools screenshots at 1440×900 and 390×844 in light AND dark. Flows → `pnpm test:e2e`.
- **Sequencing:** this is **M0** — land it before M1+ (design work). Do the **Biome** task first (isolated reformat commit), then typed-env, then Playwright.
- **Playwright is scaffolded ONLY here.** Later plans (03/04/05) reference `pnpm test:e2e` and add *spec files* only — they must NOT re-install @playwright/test, re-create `playwright.config.ts`, or re-add the `test:e2e` script.
---

This is the M0 foundation change: replace ESLint with Biome and wire an auto-format hook, landed as one isolated commit before any redesign so reformatting never pollutes later diffs.

> Verified against the repo on the planning date: latest stable Biome is **2.5.0** (`npm view @biomejs/biome dist-tags` → `latest: 2.5.0`). Current `package.json:9` is `"lint": "eslint"`; `eslint@^9.39.4` and `eslint-config-next@16.2.7` are at `package.json:46-47`; `eslint.config.mjs` exists; `.claude/hooks/` does not exist yet; `.github/workflows/ci.yml` has the Lint step at lines 29-30; drizzle migration output dir is `drizzle/`. The repo's only class-helper is `cn` (`src/lib/utils.ts:4`) plus `cva` (class-variance-authority) and `clsx` — there is **no** `tw` helper.

> Important Biome v2 facts that shape this section (verified from Biome source/docs): `useSortedClasses` lives in the **nursery** group, is `recommended: false`, and its autofix is classified **Unsafe** (`fix_kind: Unsafe`). That means `biome check --write` (safe fixes only) will **not** sort classes — only `biome check --write --unsafe` applies it. Also, Biome does **not** exit non-zero on `warn`-level diagnostics unless `--error-on-warnings` is passed. Therefore, to make the contract's "useSortedClasses for cn/cva/clsx" an enforced rule (and to make the one-time sort actually happen and CI actually fail on drift), this section sets the rule level to `"error"` and uses `--write --unsafe` for the one-time pass and in the hook.

### Task 1: Install Biome and remove ESLint dependencies

- [ ] **Step 1: Add Biome as an exact-pinned dev dependency.**
  Run:
  ```
  pnpm add -D -E @biomejs/biome
  ```
  This resolves the latest stable (2.5.0 at planning time) and pins it exactly (`-E` = `--save-exact`). Expected output: pnpm reports `+ @biomejs/biome 2.5.0` added to devDependencies and updates `pnpm-lock.yaml`. Confirm `package.json` now shows `"@biomejs/biome": "2.5.0"` (or whatever exact stable resolved) with **no** `^` caret.

- [ ] **Step 2: Remove ESLint and the Next ESLint config package.**
  Run:
  ```
  pnpm remove eslint eslint-config-next
  ```
  Expected output: pnpm reports `- eslint` and `- eslint-config-next` removed from devDependencies and updates `pnpm-lock.yaml`. Confirm neither package remains in `package.json` devDependencies (the original lines 46-47 are gone) and that `pnpm-lock.yaml` no longer contains top-level entries for them.

- [ ] **Step 3: Verify the dependency surface.**
  Run:
  ```
  pnpm ls @biomejs/biome eslint eslint-config-next
  ```
  Expected output: `@biomejs/biome` is listed with a concrete exact version; `eslint` and `eslint-config-next` are absent from the tree.

### Task 2: Create biome.json

- [ ] **Step 1: Create the Biome configuration.**
  Files:
  - Create `/Users/nanda/vibe-code/outlay/biome.json`

  Write the complete file. Pin `$schema` to the exact installed version so the schema and the binary never drift (use the version that `pnpm add` resolved in the previous task — `2.5.0` at planning time):

  ```json
  {
    "$schema": "https://biomejs.dev/schemas/2.5.0/schema.json",
    "vcs": {
      "enabled": true,
      "clientKind": "git",
      "useIgnoreFile": true
    },
    "files": {
      "ignoreUnknown": true,
      "includes": [
        "**",
        "!**/.next/**",
        "!**/out/**",
        "!**/build/**",
        "!**/node_modules/**",
        "!**/next-env.d.ts",
        "!**/drizzle/**"
      ]
    },
    "formatter": {
      "enabled": true,
      "indentStyle": "space",
      "indentWidth": 2,
      "lineWidth": 80,
      "lineEnding": "lf"
    },
    "assist": {
      "enabled": true,
      "actions": {
        "source": {
          "organizeImports": "on"
        }
      }
    },
    "linter": {
      "enabled": true,
      "rules": {
        "recommended": true,
        "nursery": {
          "useSortedClasses": {
            "level": "error",
            "options": {
              "attributes": ["className"],
              "functions": ["cn", "cva", "clsx"]
            }
          }
        }
      }
    },
    "javascript": {
      "formatter": {
        "quoteStyle": "double",
        "semicolons": "always",
        "trailingCommas": "all"
      }
    },
    "css": {
      "formatter": {
        "enabled": false
      },
      "linter": {
        "enabled": false
      }
    }
  }
  ```

  Notes:
  - `useSortedClasses` is the Tailwind class-sorter. It is explicitly enabled here even though it is a non-recommended nursery rule. Its `functions` list is exactly `cn`, `cva`, `clsx` — the three helpers that exist in this repo (`cn` in `src/lib/utils.ts`, `cva` from class-variance-authority, `clsx`). Do **not** add `tw`: there is no `tw` helper in this codebase and the contract specifies only cn/cva/clsx.
  - The rule level is `"error"`, not `"warn"`. Biome does not fail CI on `warn`-level diagnostics by default, so a `warn` level would leave the rule effectively unenforced. `"error"` makes `biome ci` fail when classes are out of order — which is the intended enforcement.
  - CSS formatting and linting are disabled so Biome never touches the Tailwind v4 `globals.css` token/`@theme` layer.
  - `organizeImports` runs via the `assist.actions.source` block (Biome v2 moved import organizing out of the linter into the assist actions API).

- [ ] **Step 2: Apply the one-time format + sort pass.**
  Run:
  ```
  pnpm exec biome check --write --unsafe .
  ```
  The `--unsafe` flag is required: the `useSortedClasses` autofix is classified Unsafe, so a plain `biome check --write` would format and organize imports but would **not** sort Tailwind classes — leaving the codebase failing `pnpm lint`. Expected output: Biome reports the files checked and the count it reformatted/sorted (e.g. `Checked N files ... Fixed M files`), exiting 0. This is the one-time reformat + class-sort that justifies the isolated M0 commit. If any error remains that Biome cannot auto-fix even with `--unsafe`, inspect and resolve it (manually) before continuing.

### Task 3: Delete the ESLint config file

- [ ] **Step 1: Remove the ESLint flat config.**
  Run:
  ```
  git rm eslint.config.mjs
  ```
  Expected output: `rm 'eslint.config.mjs'`. The file at `/Users/nanda/vibe-code/outlay/eslint.config.mjs` is staged for deletion.

### Task 4: Wire Biome into package.json scripts

- [ ] **Step 1: Replace the lint script and add a format script.**
  Files:
  - Modify `/Users/nanda/vibe-code/outlay/package.json` — replace the `lint` script (currently `package.json:9` → `"lint": "eslint"`) and add a `format` script directly after it.

  The `scripts` block becomes exactly:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx scripts/seed.ts",
    "db:init": "pnpm db:migrate && pnpm db:seed",
    "db:push": "drizzle-kit push"
  },
  ```
  Note: `lint` uses `biome check .` per the contract (this runs formatter-check + linter + assist in read-only mode; with `useSortedClasses` at `error` it fails on unsorted classes). `format` uses `biome format --write .` per the contract.

- [ ] **Step 2: Confirm no remaining references to ESLint anywhere in the source/config surface.**
  This check is placed **after** the package.json edit, the dependency removal, and the `git rm eslint.config.mjs` so that the only remaining hits would be genuine leftovers. Run:
  ```
  grep -rn "eslint" --include="*.ts" --include="*.tsx" --include="*.mjs" --include="*.json" --include="*.yml" . | grep -v node_modules | grep -v pnpm-lock.yaml
  ```
  Expected output: no matches (empty). At this point `package.json` no longer has the `eslint`/`eslint-config-next` deps or the `eslint` lint script, and `eslint.config.mjs` is gone. If any line prints (e.g. a stray comment), address it before continuing. (`pnpm-lock.yaml` is excluded because transitive sub-deps may still legitimately reference an eslint-named package via other tooling; the top-level entries were already verified removed in the install task.)

- [ ] **Step 3: Verify the lint script runs Biome cleanly.**
  Run:
  ```
  pnpm lint
  ```
  Expected output: `biome check .` runs, prints `Checked N files`, and exits 0 with no errors. Because the one-time `--write --unsafe` pass already sorted all classes and `useSortedClasses` is at `error`, a residual unsorted class would fail here — a clean exit confirms the pass was complete.

### Task 5: Update the CI lint step

- [ ] **Step 1: Rename and rewire the CI lint step to Biome.**
  Files:
  - Modify `/Users/nanda/vibe-code/outlay/.github/workflows/ci.yml` (the Lint step at lines 29-30)

  Replace the existing lint step:
  ```yaml
      - name: Lint
        run: pnpm lint
  ```
  with:
  ```yaml
      - name: Lint (Biome)
        run: pnpm exec biome ci .
  ```

  Notes: `biome ci .` is the CI-optimized command (non-interactive, never writes, fails on any formatting diff or lint error) and reads the same `biome.json`. With `useSortedClasses` at `error`, CI will fail on any unsorted Tailwind class — the desired enforcement. The Typecheck, Test, and Build steps (lines 32-48) are unchanged.

- [ ] **Step 2: Confirm the CI command works locally exactly as it will in CI.**
  Run:
  ```
  pnpm exec biome ci .
  ```
  Expected output: `Checked N files` and exit 0. If it reports any unformatted file, unorganized imports, or lint error, run `pnpm exec biome check --write --unsafe .` to fix, then re-run until clean.

### Task 6: Add the PostToolUse auto-format hook script

- [ ] **Step 1: Create the post-edit Biome hook script.**
  Files:
  - Create `/Users/nanda/vibe-code/outlay/.claude/hooks/post-edit-check.mjs` (the `.claude/hooks/` directory does not exist yet and will be created by writing this file)

  Write the complete file. It reads the hook JSON payload from stdin, extracts the edited file path from `tool_input.file_path`, and runs `biome check --write --unsafe` on just that file. The `--unsafe` flag is required so the hook actually sorts Tailwind classes (the `useSortedClasses` fix is unsafe). It always exits 0 (a formatter failure must never block editing) and only acts on file types Biome handles:

  ```js
  #!/usr/bin/env node
  // PostToolUse(Edit|Write) hook: auto-format the just-edited file with Biome.
  // Reads the hook payload from stdin, runs `biome check --write --unsafe <file>`
  // on the single changed file. --unsafe is needed so Tailwind class sorting
  // (an unsafe fix) is actually applied. Never blocks the edit: always exits 0.

  import { spawnSync } from "node:child_process";
  import { existsSync } from "node:fs";
  import { extname } from "node:path";

  const FORMATTABLE = new Set([
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".ts",
    ".tsx",
    ".json",
    ".jsonc",
  ]);

  async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }

  async function main() {
    let payload;
    try {
      payload = JSON.parse(await readStdin());
    } catch {
      process.exit(0);
    }

    const filePath = payload?.tool_input?.file_path;
    if (typeof filePath !== "string" || filePath.length === 0) process.exit(0);
    if (!existsSync(filePath)) process.exit(0);
    if (!FORMATTABLE.has(extname(filePath))) process.exit(0);

    spawnSync(
      "pnpm",
      [
        "exec",
        "biome",
        "check",
        "--write",
        "--unsafe",
        "--no-errors-on-unmatched",
        filePath,
      ],
      { stdio: "ignore" },
    );

    // Never block the edit, regardless of Biome's exit status.
    process.exit(0);
  }

  main();
  ```

  Notes: `--no-errors-on-unmatched` keeps Biome silent when the path falls outside `biome.json`'s `includes` (e.g. a file under `drizzle/`). `stdio: "ignore"` keeps hook output clean. The script always exits 0 so a lint error never aborts an Edit/Write.

- [ ] **Step 2: Smoke-test the hook with a synthetic payload.**
  Run:
  ```
  printf '{"tool_input":{"file_path":"%s/biome.json"}}' "$PWD" | node .claude/hooks/post-edit-check.mjs; echo "exit=$?"
  ```
  Expected output: `exit=0` (the script runs Biome against `biome.json` and exits 0). No content change is expected because `biome.json` was already written formatted.

### Task 7: Register the hook and Biome permissions in .claude/settings.json

- [ ] **Step 1: Add the PostToolUse hook and Biome allowlist entries.**
  Files:
  - Modify `/Users/nanda/vibe-code/outlay/.claude/settings.json`

  The current file has only a `permissions` block (no `hooks`). It becomes exactly:
  ```json
  {
    "permissions": {
      "allow": [
        "Bash(pnpm lint)",
        "Bash(pnpm test)",
        "Bash(pnpm build)",
        "Bash(pnpm exec tsc --noEmit)",
        "Bash(pnpm exec vitest:*)",
        "Bash(pnpm exec biome:*)",
        "Bash(pnpm format)",
        "Bash(pnpm db:generate)",
        "Bash(pnpm db:migrate)",
        "Bash(git status)",
        "Bash(git diff:*)",
        "Bash(git log:*)"
      ],
      "deny": [
        "Read(./.env.local)",
        "Read(./data/**)"
      ]
    },
    "hooks": {
      "PostToolUse": [
        {
          "matcher": "Edit|Write",
          "hooks": [
            {
              "type": "command",
              "command": "node .claude/hooks/post-edit-check.mjs"
            }
          ]
        }
      ]
    }
  }
  ```

  Notes: `Bash(pnpm exec biome:*)` covers `biome check`, `biome ci`, and `biome format`; `Bash(pnpm format)` covers the new script. The `PostToolUse` matcher `Edit|Write` fires the formatter after every edit. The two new additions versus the current file are the `Bash(pnpm exec biome:*)` + `Bash(pnpm format)` allow entries and the entire `hooks` block.

- [ ] **Step 2: Validate the settings JSON parses.**
  Run:
  ```
  node -e "JSON.parse(require('node:fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"
  ```
  Expected output: `ok`. A parse error means a stray comma or brace must be fixed.

### Task 8: Full verification of the M0 toolchain swap

- [ ] **Step 1: Typecheck.**
  Run:
  ```
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors, exit 0.

- [ ] **Step 2: Lint with Biome.**
  Run:
  ```
  pnpm lint
  ```
  Expected output: `Checked N files` and exit 0, no errors (formatting, organized imports, and Tailwind class sorting all clean).

- [ ] **Step 3: Build.**
  Run:
  ```
  pnpm build
  ```
  Expected output: Next.js build completes successfully (`Compiled successfully` / route summary printed), exit 0. The build no longer invokes ESLint (the `eslint-config-next` package is removed and Next 16 does not run lint during `next build` by default); this is expected.

- [ ] **Step 4: Run the test suite to confirm no regressions from reformatting.**
  Run:
  ```
  pnpm test
  ```
  Expected output: all Vitest tests pass, exit 0. (The repo has a `vitest.config.ts` and existing test files such as `src/lib/money.test.ts`, `src/lib/gate.test.ts`, and `src/lib/validators/expense-schema.test.ts`; the one-time reformat must not change any of their behavior.)

### Task 9: Commit M0 as an isolated commit

- [ ] **Step 1: Stage every change from this section.**
  Run:
  ```
  git add package.json pnpm-lock.yaml biome.json .github/workflows/ci.yml .claude/settings.json .claude/hooks/post-edit-check.mjs eslint.config.mjs
  ```
  Then stage any files reformatted/class-sorted by the one-time `biome check --write --unsafe` pass:
  ```
  git add -A
  ```
  Expected output: no error. `git status` shows the deleted `eslint.config.mjs`, the new `biome.json` and hook, the modified `package.json`/CI/settings, and any reformatted source files.

- [ ] **Step 2: Review the staged diff is tooling + reformat only.**
  Run:
  ```
  git diff --cached --stat
  ```
  Expected output: the file list above plus purely-mechanical reformat/import-order/class-sort changes in source files. Confirm there are NO behavioral/logic changes (no edits to server-action logic, queries, or component behavior) — only formatting, import ordering, and Tailwind class ordering.

- [ ] **Step 3: Commit.**
  Run:
  ```
  git commit -m "$(cat <<'EOF'
  chore(tooling): replace ESLint with Biome + auto-format hook (M0)

  - Add @biomejs/biome (exact pin); remove eslint + eslint-config-next
  - Delete eslint.config.mjs; add biome.json (recommended rules,
    useSortedClasses=error for cn/cva/clsx, organizeImports, CSS off)
  - lint -> "biome check ."; add format -> "biome format --write ."
  - CI lint step -> "biome ci ."
  - PostToolUse(Edit|Write) hook runs biome check --write --unsafe on
    the changed file (so Tailwind class sorting is applied)
  - Allow biome in .claude permissions

  Isolated M0 commit landed before redesign so the one-time reformat
  and class-sort does not pollute later diffs.

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  EOF
  )"
  ```
  Expected output: one commit created with the file count from the staged diff; `git log -1 --oneline` shows the M0 commit.

## Typed env module (zod)

This section introduces a single typed env module so every server file reads validated configuration from one place instead of poking at `process.env` directly. Validation is fail-fast with a readable error at runtime.

CRITICAL constraint (from spec, confirmed against `.github/workflows/ci.yml`): the production build runs the `Build` step with **only** `AUTH_SECRET` + `DATABASE_URL` set — it does **not** set `HOUSEHOLD_PASSCODE`, Google, or Turso vars. Because `src/lib/env.ts` is transitively imported by the build graph (`@/lib/db` → queries/actions → app pages), an eager parse that *requires* `HOUSEHOLD_PASSCODE` would throw during `pnpm build` and break CI. The module therefore **relaxes validation during the build phase** (`process.env.NEXT_PHASE === "phase-production-build"`, which Next.js sets during `next build`) while still validating fully and fail-fast at runtime. `HOUSEHOLD_PASSCODE` stays a required runtime var; CI is not asked to add it.

### Task 10: Create the typed env schema with failing tests first

- [ ] **Step 1: Write the failing test file `src/lib/env.test.ts`.** This drives out the schema shape and the fail-fast formatting. We test the raw schema (`envSchema`) and the error-formatting helper (`formatEnvError`) directly so tests never depend on the ambient `process.env` of the test runner, and never trigger the eager parse.

  Files:
  - Create: `src/lib/env.test.ts`

  ```ts
  import { describe, it, expect } from "vitest";
  import { envSchema, formatEnvError } from "./env";

  const valid = {
    DATABASE_URL: "file:./data/expense.db",
    AUTH_SECRET: "x".repeat(32),
    HOUSEHOLD_PASSCODE: "swordfish",
  };

  describe("envSchema", () => {
    it("accepts the minimal valid input", () => {
      const result = envSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.DATABASE_URL).toBe("file:./data/expense.db");
        expect(result.data.AUTH_SECRET).toBe("x".repeat(32));
        expect(result.data.HOUSEHOLD_PASSCODE).toBe("swordfish");
        expect(result.data.AUTH_GOOGLE_ID).toBeUndefined();
        expect(result.data.AUTH_GOOGLE_SECRET).toBeUndefined();
        expect(result.data.HOUSEHOLD_ALLOWED_EMAILS).toBeUndefined();
        expect(result.data.TURSO_AUTH_TOKEN).toBeUndefined();
      }
    });

    it("accepts the optional vars when present", () => {
      const result = envSchema.safeParse({
        ...valid,
        AUTH_GOOGLE_ID: "id",
        AUTH_GOOGLE_SECRET: "secret",
        HOUSEHOLD_ALLOWED_EMAILS: "a@b.com,c@d.com",
        TURSO_AUTH_TOKEN: "token",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.AUTH_GOOGLE_ID).toBe("id");
        expect(result.data.TURSO_AUTH_TOKEN).toBe("token");
      }
    });

    it("rejects when a required var is missing", () => {
      const { AUTH_SECRET, ...rest } = valid;
      void AUTH_SECRET;
      const result = envSchema.safeParse(rest);
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("AUTH_SECRET");
      }
    });

    it("rejects an invalid value (empty required string)", () => {
      const result = envSchema.safeParse({ ...valid, HOUSEHOLD_PASSCODE: "" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join("."));
        expect(paths).toContain("HOUSEHOLD_PASSCODE");
      }
    });

    it("treats an empty optional string as absent (Vercel empty-var quirk)", () => {
      const result = envSchema.safeParse({ ...valid, TURSO_AUTH_TOKEN: "" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.TURSO_AUTH_TOKEN).toBeUndefined();
      }
    });
  });

  describe("formatEnvError", () => {
    it("lists each offending var with a clear, fail-fast message", () => {
      const result = envSchema.safeParse({ DATABASE_URL: "file:./x.db" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = formatEnvError(result.error);
        expect(message).toContain("Invalid environment variables");
        expect(message).toContain("AUTH_SECRET");
        expect(message).toContain("HOUSEHOLD_PASSCODE");
      }
    });
  });
  ```

- [ ] **Step 2: Run the test and watch it fail (no module yet).**

  Command:
  ```
  pnpm exec vitest run src/lib/env.test.ts
  ```

  Expected output: failure — Vitest reports it cannot resolve `./env` (e.g. `Failed to load url ./env` / `Cannot find module`). This confirms the test is wired to the not-yet-created module.

- [ ] **Step 3: Create `src/lib/env.ts` with the schema, formatter, and parsed export.** Required vars are non-empty strings; optional vars use a preprocessor that maps `""` to `undefined` (Vercel injects empty strings for unset vars) plus `.optional()`. Parsing runs once at import. To satisfy the CRITICAL DB-free-build constraint, the parse is **relaxed during `next build`** (`process.env.NEXT_PHASE === "phase-production-build"`): in that phase the schema is parsed with `.partial()` so the absent `HOUSEHOLD_PASSCODE` does not throw, while at runtime the full schema is enforced fail-fast. The formatter is dependency-free and walks Zod issues.

  Files:
  - Create: `src/lib/env.ts`

  ```ts
  import { z } from "zod/v4";

  // Vercel (and some shells) inject unset variables as empty strings rather
  // than leaving them absent. Treat "" as "not provided" for optional vars so
  // the DB-free CI build — which sets only AUTH_SECRET + DATABASE_URL — passes.
  const optionalString = z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  );

  export const envSchema = z.object({
    // Required at runtime, including a real deployment.
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    HOUSEHOLD_PASSCODE: z.string().min(1),

    // Optional: Google sign-in and Turso are not needed for the CI build.
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,
    HOUSEHOLD_ALLOWED_EMAILS: optionalString,
    TURSO_AUTH_TOKEN: optionalString,
  });

  export type Env = z.infer<typeof envSchema>;

  /** Human-readable, fail-fast summary listing each missing/invalid variable. */
  export function formatEnvError(error: z.ZodError): string {
    const lines = error.issues.map((issue) => {
      const name = issue.path.join(".") || "(root)";
      return `  - ${name}: ${issue.message}`;
    });
    return `Invalid environment variables:\n${lines.join("\n")}`;
  }

  // Next.js sets NEXT_PHASE to "phase-production-build" while `next build` runs.
  // The build executes no queries (pages are dynamic) and CI provides only
  // AUTH_SECRET + DATABASE_URL, so we relax required-var checks during the
  // build and re-enforce the full schema at runtime (fail-fast).
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  function parseEnv(): Env {
    const schema = isBuildPhase ? envSchema.partial() : envSchema;
    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new Error(formatEnvError(result.error));
    }
    // During the build phase the partial parse may omit required keys; the
    // returned object is only ever read by code paths that don't run at build
    // time, so the cast is safe and runtime parsing remains strict.
    return result.data as Env;
  }

  /** Parsed once at import; throws immediately on misconfiguration at runtime. */
  export const env = parseEnv();
  ```

- [ ] **Step 4: Run the test and watch it pass.**

  Command:
  ```
  pnpm exec vitest run src/lib/env.test.ts
  ```

  Expected output: all tests pass (`Test Files 1 passed`, `Tests 7 passed` — 6 `envSchema` cases + 1 `formatEnvError` case). The test imports `envSchema`/`formatEnvError` (not `env`), so the eager parse never runs against the runner's `process.env` and cannot fail the suite.

- [ ] **Step 5: Commit.**

  Command:
  ```
  git add src/lib/env.ts src/lib/env.test.ts && git commit -m "Add typed env module with zod validation

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

  Expected output: one commit created with 2 files changed.

### Task 11: Replace raw process.env reads with the typed env export

- [ ] **Step 1: Update `src/lib/db/index.ts` to read from `env`.** Because the env module guarantees `DATABASE_URL` at runtime, the `?? "file:..."` fallback is dropped. Rewrite the whole file.

  Files:
  - Modify: `src/lib/db/index.ts`

  Replace the entire file contents with:
  ```ts
  import { drizzle } from "drizzle-orm/libsql";
  import { createClient } from "@libsql/client";
  import * as schema from "./schema";
  import { env } from "@/lib/env";

  // One driver for both worlds: a local SQLite file (`file:./data/expense.db`)
  // in development, and a Turso/libSQL URL (`libsql://...` + auth token) in production.
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  export const db = drizzle(client, { schema });
  ```

- [ ] **Step 2: Update `src/auth.ts` to read the allow-list from `env`.** Google client id/secret are still read implicitly by the Google provider from `process.env` (Auth.js convention) — do not change that. Only the explicit `process.env.HOUSEHOLD_ALLOWED_EMAILS` read moves to `env`. Keep `process.env.NODE_ENV` as-is (Next/Node built-in, not part of our app config schema). Rewrite the whole file.

  Files:
  - Modify: `src/auth.ts`

  Replace the entire file contents with:
  ```ts
  import NextAuth from "next-auth";
  import Google from "next-auth/providers/google";
  import { isEmailAllowed } from "@/lib/allow-list";
  import { env } from "@/lib/env";

  export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [Google], // reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env
    session: { strategy: "jwt" }, // stateless; no DB adapter (Model A)
    pages: { signIn: "/login" },
    callbacks: {
      // Allow-list: only these Google accounts may sign in. With no allow-list
      // configured, development allows everyone (local convenience) and
      // production fails closed — see isEmailAllowed.
      signIn({ user }) {
        return isEmailAllowed(
          user.email,
          env.HOUSEHOLD_ALLOWED_EMAILS,
          process.env.NODE_ENV === "production",
        );
      },
    },
  });
  ```

- [ ] **Step 3: Update `src/lib/gate.ts` to read `AUTH_SECRET` from `env`.** The local `getSecret()` helper is deleted because `env` already guarantees `AUTH_SECRET` is a non-empty string at runtime. Add the import, delete the helper, and update the single call site in `hmac`.

  Files:
  - Modify: `src/lib/gate.ts`

  Add the import as the first line of the file (this file currently has no import statements; the file opens with a block comment, so place the import immediately above that comment):
  ```ts
  import { env } from "@/lib/env";
  ```

  Delete the `getSecret` helper entirely (no replacement):
  ```ts
  function getSecret(): string {
    const secret = process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_SECRET is not set");
    return secret;
  }
  ```

  Then in `hmac`, replace the `importKey` source so the function reads:
  ```ts
  async function hmac(data: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.AUTH_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
    return toBase64Url(signature);
  }
  ```

  Note: `src/lib/gate.test.ts` sets `process.env.AUTH_SECRET = SECRET` in a `beforeAll`. Because `env` is parsed eagerly at import, the test harness must have `AUTH_SECRET` present *before* the module graph loads. The existing test already sets it in `beforeAll`, which runs after import — so add a top-of-file assignment guard in the test (`process.env.AUTH_SECRET ??= "test-secret-for-gate-tests";` via `vi.hoisted` or a module-level statement before the `@/lib/gate` import) to guarantee the eager parse succeeds. This is verified in Step 9.

- [ ] **Step 4: Update `src/lib/actions/auth-actions.ts` to read `HOUSEHOLD_PASSCODE` from `env`.** Because `env.HOUSEHOLD_PASSCODE` is guaranteed non-empty at runtime, the "Server is missing HOUSEHOLD_PASSCODE" branch becomes dead code; remove it. Keep `process.env.NODE_ENV` for the cookie `secure` flag (Node built-in, not app config).

  Files:
  - Modify: `src/lib/actions/auth-actions.ts`

  Add the import directly after the existing `import { signOut } from "@/auth";` line:
  ```ts
  import { env } from "@/lib/env";
  ```

  Replace this block:
  ```ts
    const passcode = String(formData.get("passcode") ?? "");
    const expected = process.env.HOUSEHOLD_PASSCODE;

    if (!expected) {
      return { error: "Server is missing HOUSEHOLD_PASSCODE." };
    }
    if (!constantTimeEqual(passcode, expected)) {
      console.error("[auth] failed passcode attempt");
      await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
      return { error: "Incorrect passcode." };
    }
  ```
  with:
  ```ts
    const passcode = String(formData.get("passcode") ?? "");

    if (!constantTimeEqual(passcode, env.HOUSEHOLD_PASSCODE)) {
      console.error("[auth] failed passcode attempt");
      await new Promise((resolve) => setTimeout(resolve, FAILED_ATTEMPT_DELAY_MS));
      return { error: "Incorrect passcode." };
    }
  ```

  Note: `src/lib/actions/auth-actions.test.ts` already sets `process.env.AUTH_SECRET ??= "test-secret"` and `process.env.HOUSEHOLD_PASSCODE = "correct-horse"` inside a `vi.hoisted(...)` block, which runs *before* module imports — so the eager `env` parse succeeds in that test. No test change needed here; verified in Step 9.

- [ ] **Step 5: Confirm the allow-list reader needs no change.** `src/lib/allow-list.ts` takes `rawAllowList` as a parameter and never reads `process.env` itself — its caller (`src/auth.ts`) was updated in Step 2. No edit required; this step is a no-op verification.

  Command:
  ```
  grep -n "process.env" src/lib/allow-list.ts
  ```

  Expected output: no matches (exit code 1, empty output) — confirming `allow-list.ts` reads no env directly.

- [ ] **Step 6: Confirm the serwist route is intentionally left untouched.** `src/app/serwist/[path]/route.ts` reads `process.env.VERCEL_GIT_COMMIT_SHA`, a Vercel-injected build identifier (like `NODE_ENV`), not an app-config var in our schema. It is correctly out of scope for this migration.

  Command:
  ```
  grep -n "process.env" "src/app/serwist/[path]/route.ts"
  ```

  Expected output: exactly one match — `process.env.VERCEL_GIT_COMMIT_SHA` — which is expected and stays as-is.

- [ ] **Step 7: Verify no other raw reads of the migrated vars remain.** The migrated keys are `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `AUTH_SECRET`, `HOUSEHOLD_PASSCODE`, `HOUSEHOLD_ALLOWED_EMAILS`. `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are intentionally read by the Auth.js Google provider, `NODE_ENV` is a Node built-in, and `NEXT_PHASE` is read inside `env.ts` itself — all expected to remain.

  Command:
  ```
  grep -rn "process\.env\.DATABASE_URL\|process\.env\.TURSO_AUTH_TOKEN\|process\.env\.AUTH_SECRET\|process\.env\.HOUSEHOLD_PASSCODE\|process\.env\.HOUSEHOLD_ALLOWED_EMAILS" src --include="*.ts" --include="*.tsx" --exclude="*.test.ts"
  ```

  Expected output: no matches (empty). If any line appears, migrate that read to `env` before continuing. Test files (`*.test.ts`) legitimately set these via `process.env` in their harnesses and are excluded.

- [ ] **Step 8: Typecheck.**

  Command:
  ```
  pnpm exec tsc --noEmit
  ```

  Expected output: no errors (clean exit). Confirms the `env` import path `@/lib/env` resolves and the removed `getSecret`/`expected` references are gone.

- [ ] **Step 9: Lint.**

  Command:
  ```
  pnpm lint
  ```

  Expected output: no errors or warnings for the edited files (notably no `unused var` for the now-deleted `getSecret`/`expected`).

- [ ] **Step 10: Run the full test suite to confirm no regressions in auth/gate integration tests.**

  Command:
  ```
  pnpm test
  ```

  Expected output: all tests pass. Tests set `DATABASE_URL`, `AUTH_SECRET`, and `HOUSEHOLD_PASSCODE` via their harnesses *before* module import (`vi.hoisted` / top-of-file assignment), so the eager `env` parse in imported modules succeeds.

- [ ] **Step 11: Prove the DB-free CI build still works with ONLY `AUTH_SECRET` + `DATABASE_URL` (mirrors `ci.yml` exactly).** This is the CRITICAL spec check: `HOUSEHOLD_PASSCODE` and the Google/Turso vars are intentionally omitted, exactly as CI runs it. The build must succeed because `env.ts` relaxes required-var validation during `phase-production-build`.

  Command:
  ```
  AUTH_SECRET=ci-only-dummy-secret DATABASE_URL=":memory:" pnpm build
  ```

  Expected output: build completes successfully with no "Invalid environment variables" error. If the build throws on a missing `HOUSEHOLD_PASSCODE`, the build-phase relaxation in `env.ts` (Step 3 of the previous task) is broken — fix `env.ts`, do NOT add vars to CI or relax the runtime schema.

- [ ] **Step 12: Commit.**

  Command:
  ```
  git add src/lib/db/index.ts src/auth.ts src/lib/gate.ts src/lib/gate.test.ts src/lib/actions/auth-actions.ts && git commit -m "Read env via typed env module instead of raw process.env

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```

  Expected output: one commit created (5 files if `gate.test.ts` needed the import-order guard from Step 3; 4 files otherwise).

## Playwright e2e scaffold (mobile-first)

This section adds a mobile-first Playwright e2e scaffold with a single Pixel 7 project, a global-setup that builds and seeds a dedicated `data/e2e.db`, a passcode-only smoke test, a non-blocking parallel CI job, and a `.claude/rules` note about the Next.js route announcer.

Verified facts against the codebase (these drive selectors and paths):
- Login page renders `CardTitle` as a `<div data-slot="card-title">` (`src/components/ui/card.tsx:36-46`), NOT a heading — so the "Welcome to Outlay" assertion MUST use `getByText`, not `getByRole("heading", …)`.
- The dashboard `<h1>` is rendered by `PageHeader` (`src/components/shared/page-header.tsx:11`) with `title="Dashboard"` (`src/app/(app)/dashboard/page.tsx:64`), so `getByRole("heading", { name: "Dashboard", level: 1 })` is correct.
- Passcode input: `placeholder="Enter household passcode"`, `name="passcode"` (`src/components/auth/passcode-form.tsx:16-22`); submit button text is `Unlock` (`passcode-form.tsx:28-30`).
- On success `verifyPasscode` sets the session cookie and `redirect("/dashboard")` (`src/lib/actions/auth-actions.ts:38-47`).
- `getCurrentHousehold()` falls back to the first household (`src/lib/queries/household-queries.ts:9-30`), so a seeded `data/e2e.db` is sufficient for the dashboard to render without setting `he_household`.
- `drizzle.config.ts:8` and `src/lib/db/index.ts` both read `process.env.DATABASE_URL`, so prefixing it redirects migrate + seed at the e2e DB with no code change.
- Migrations on disk: `0000_public_moondragon`, `0001_money_minor_units`, `0002_strong_sphinx` (`drizzle/`). The seed early-returns if a household exists (`src/lib/db/seed.ts:8-13`).
- `.claude/rules/` does not exist yet (only `.claude/settings.json` and `.claude/skills/`), so the rules file is a brand-new file.

### Task 12: Install @playwright/test as an exact dev dependency

- [ ] **Step 1: Install the package at exact latest-stable.** Run:
  ```bash
  pnpm add -D -E @playwright/test@latest
  ```
  `-E` (`--save-exact`) writes the version with no caret; `@latest` resolves the current stable release rather than hardcoding a version string. Expected output: pnpm reports `+ @playwright/test <version>` added to `devDependencies`, and `package.json` / `pnpm-lock.yaml` are updated.

- [ ] **Step 2: Verify the pin is exact.** Run:
  ```bash
  node -e "const v=require('./package.json').devDependencies['@playwright/test']; if(/^[\^~]/.test(v)){console.error('NOT pinned:',v);process.exit(1)} console.log('pinned exact:',v)"
  ```
  Expected output: `pinned exact: <version>` (no leading `^` or `~`); exit code 0.

- [ ] **Step 3: Commit.** Run:
  ```bash
  git add package.json pnpm-lock.yaml && git commit -m "build: add @playwright/test (pinned) for e2e scaffold

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit created with two files changed.

### Task 13: Add the db:e2e and test:e2e scripts

The global-setup shells out to a single npm script so the DB-build sequence (migrate then seed) lives in one place and stays in sync with `pnpm db:init`. The script must point both drizzle-kit and the libSQL client at `data/e2e.db` via `DATABASE_URL`.

- [ ] **Step 1: Add the `test:e2e` and `db:e2e` scripts.** Replace the entire `"scripts"` object in `package.json` (currently lines 5-17, ending with `"db:push"`) with:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx scripts/seed.ts",
    "db:init": "pnpm db:migrate && pnpm db:seed",
    "db:push": "drizzle-kit push",
    "db:e2e": "DATABASE_URL=file:./data/e2e.db pnpm db:migrate && DATABASE_URL=file:./data/e2e.db pnpm db:seed"
  },
  ```
  Notes:
  - `drizzle.config.ts:8` reads `process.env.DATABASE_URL ?? "file:./data/expense.db"`, and `src/lib/db/index.ts` reads the same var, so the inline `DATABASE_URL=...` redirects both migrate and seed at the e2e DB with no code change. Inline env-var assignment propagates to the nested `pnpm` child process and on to `drizzle-kit` / `tsx`.
  - This `db:e2e` script uses POSIX-shell `VAR=val cmd` syntax (it is only ever invoked from `e2e/global-setup.ts` via `execSync` and from the ubuntu CI runner — both bash), so cross-platform Windows shells are out of scope.
  - The seed is idempotent (early-returns if a household exists, `src/lib/db/seed.ts:8-13`); global-setup deletes the DB first so each run starts clean.

- [ ] **Step 2: Verify the script runs end-to-end.** Run:
  ```bash
  rm -f data/e2e.db data/e2e.db-shm data/e2e.db-wal && mkdir -p data && pnpm db:e2e
  ```
  Expected output: drizzle-kit applies migrations `0000_public_moondragon`, `0001_money_minor_units`, `0002_strong_sphinx`, then `Database seeded successfully!` prints. (The `rm` and `mkdir` here are a local-only convenience for this verify step; they are not part of the committed `db:e2e` script — global-setup handles cleanup and directory creation at runtime.)

- [ ] **Step 3: Commit.** Run:
  ```bash
  git add package.json && git commit -m "build: add db:e2e and test:e2e scripts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 14: Gitignore the e2e database artifacts

- [ ] **Step 1: Add the e2e DB glob and Playwright outputs.** Modify `.gitignore`. The `# database` block is lines 43-46:
  ```
  # database
  /data/*.db
  /data/*.db-wal
  /data/*.db-shm
  ```
  The existing `/data/*.db` glob already matches `data/e2e.db`, but add an explicit, intention-revealing entry plus Playwright outputs. Replace lines 43-46 with:
  ```
  # database
  /data/*.db
  /data/*.db-wal
  /data/*.db-shm
  /data/e2e.db*

  # playwright e2e
  /playwright-report/
  /test-results/
  /playwright/.cache/
  ```

- [ ] **Step 2: Verify nothing leaks.** Run:
  ```bash
  git check-ignore data/e2e.db data/e2e.db-wal playwright-report/index.html test-results/foo
  ```
  Expected output: all four paths are echoed back (each is ignored); exit code 0.

- [ ] **Step 3: Commit.** Run:
  ```bash
  git add .gitignore && git commit -m "chore: gitignore e2e db and playwright artifacts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 15: Create the Playwright global-setup that builds the e2e DB

`globalSetup` runs once before the suite and (re)builds a clean seeded `data/e2e.db` by invoking the `db:e2e` script, so every run starts from a known passcode-unlockable state.

- [ ] **Step 1: Create `e2e/global-setup.ts`** with complete contents:
  ```ts
  import { execSync } from "node:child_process";
  import { mkdirSync, rmSync } from "node:fs";

  /**
   * Builds a clean, seeded e2e database before the Playwright suite runs.
   * Deletes any stale data/e2e.db* artifacts, ensures the data/ directory
   * exists (libSQL does NOT create it, and a fresh CI checkout has no data/
   * dir), then runs `pnpm db:e2e` (drizzle migrate + seed) against
   * file:./data/e2e.db. The webServer launched by playwright.config.ts is
   * pointed at the same file, so the passcode-unlock smoke test sees a fully
   * seeded household.
   */
  export default function globalSetup() {
    mkdirSync("data", { recursive: true });
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`data/e2e.db${suffix}`, { force: true });
    }
    execSync("pnpm db:e2e", { stdio: "inherit" });
  }
  ```
  Note: `mkdirSync("data", { recursive: true })` is required — libSQL opening `file:./data/e2e.db` does not create the parent directory, and CI checkouts lack the gitignored `data/` dir, so migrate would otherwise fail with "unable to open database file".

- [ ] **Step 2: Typecheck the new file.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  (`tsconfig.json` `include` is `**/*.ts`, so `e2e/global-setup.ts` is typechecked.) Expected output: no errors (clean exit, no output).

- [ ] **Step 3: Commit.** Run:
  ```bash
  git add e2e/global-setup.ts && git commit -m "test(e2e): add global-setup that builds the seeded e2e db

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 16: Create playwright.config.ts (single Pixel 7 mobile project)

A mobile-first config: one project using the built-in Pixel 7 device, a `webServer` that runs the production server against the e2e DB with deterministic e2e env, `baseURL` of `http://localhost:3000`, CI-aware retries/reporter, and the global-setup wired in.

- [ ] **Step 1: Create `playwright.config.ts`** with complete contents:
  ```ts
  import { defineConfig, devices } from "@playwright/test";

  const isCI = !!process.env.CI;

  /**
   * Mobile-first e2e config. Single Pixel 7 project — Outlay is a phone-first
   * household PWA, so the smoke suite runs at the primary form factor only.
   * The webServer builds + starts the real Next.js server against a dedicated
   * seeded SQLite file (data/e2e.db, built by e2e/global-setup.ts) with fixed
   * e2e credentials so the passcode-unlock path is deterministic.
   */
  export default defineConfig({
    testDir: "./e2e",
    globalSetup: "./e2e/global-setup.ts",
    fullyParallel: true,
    forbidOnly: isCI,
    retries: isCI ? 2 : 0,
    workers: isCI ? 1 : undefined,
    reporter: isCI
      ? [["github"], ["html", { open: "never" }]]
      : [["list"], ["html", { open: "never" }]],
    use: {
      baseURL: "http://localhost:3000",
      trace: "on-first-retry",
    },
    projects: [
      {
        name: "mobile",
        use: { ...devices["Pixel 7"] },
      },
    ],
    webServer: {
      command: "pnpm build && pnpm start",
      url: "http://localhost:3000",
      reuseExistingServer: !isCI,
      timeout: 180_000,
      env: {
        DATABASE_URL: "file:./data/e2e.db",
        AUTH_SECRET: "e2e-secret",
        HOUSEHOLD_PASSCODE: "e2e-pass",
      },
    },
  });
  ```
  Notes: the `html` reporter writes to `playwright-report/` by default (the path CI uploads). The `github` reporter is added only under CI as required. `pnpm start` runs the production server so the build env matches CI; `webServer.env` supplies the exact `DATABASE_URL` / `AUTH_SECRET` / `HOUSEHOLD_PASSCODE` from the spec, and `HOUSEHOLD_PASSCODE=e2e-pass` is what the smoke test types.

- [ ] **Step 2: Typecheck.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 3: Lint.** Run:
  ```bash
  pnpm lint
  ```
  Expected output: no errors or warnings for `playwright.config.ts` (or any file).

- [ ] **Step 4: Commit.** Run:
  ```bash
  git add playwright.config.ts && git commit -m "test(e2e): add playwright config (Pixel 7 mobile, seeded webServer)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 17: Write the login smoke test (passcode path)

The test loads `/login`, fills the passcode input (`placeholder="Enter household passcode"`, `name="passcode"`, `src/components/auth/passcode-form.tsx:16-22`), clicks the `Unlock` button (`passcode-form.tsx:28-30`), waits for the redirect to `/dashboard`, and asserts the dashboard `<h1>Dashboard</h1>` (rendered by `PageHeader`, `src/components/shared/page-header.tsx:11`, with `title="Dashboard"` from `src/app/(app)/dashboard/page.tsx:64`) is visible. Per the contract we must NOT use `getByRole("alert")` (collides with the Next.js route announcer).

IMPORTANT selector correction: the login card title "Welcome to Outlay" is rendered by `CardTitle` as a `<div data-slot="card-title">`, NOT a heading element (`src/components/ui/card.tsx:36-46`). Asserting `getByRole("heading", { name: "Welcome to Outlay" })` would FAIL — use `getByText("Welcome to Outlay")` instead. Only the dashboard title is a real `<h1>`.

- [ ] **Step 1: Create `e2e/login.spec.ts`** with complete contents:
  ```ts
  import { test, expect } from "@playwright/test";

  /**
   * Passcode-only smoke test. Google sign-in needs a real IdP, so the e2e
   * suite exercises the shared-passcode path exclusively. The passcode value
   * matches HOUSEHOLD_PASSCODE in playwright.config.ts's webServer.env.
   *
   * NOTE: never assert getByRole("alert") here — it collides with the
   * Next.js App Router route announcer (a visually-hidden role="alert"
   * live region). See .claude/rules/playwright.md.
   *
   * NOTE: "Welcome to Outlay" is a CardTitle <div data-slot="card-title">,
   * NOT a heading — assert it with getByText, never getByRole("heading").
   * The dashboard "Dashboard" title IS a real <h1> (PageHeader).
   */
  test("unlocks with the household passcode and shows the dashboard", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(page.getByText("Welcome to Outlay")).toBeVisible();

    await page.getByPlaceholder("Enter household passcode").fill("e2e-pass");
    await page.getByRole("button", { name: "Unlock" }).click();

    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
  });
  ```
  Selector justification: `getByPlaceholder("Enter household passcode")` targets the `Input` (`passcode-form.tsx:19`); the submit button text is exactly `Unlock` (`passcode-form.tsx:28-30`, idle state); the dashboard heading is the single `<h1>` from `PageHeader`; and `getByText("Welcome to Outlay")` avoids the false assumption that `CardTitle` is a heading.

- [ ] **Step 2: Install the Chromium browser binary locally (one-time).** Run:
  ```bash
  pnpm exec playwright install chromium
  ```
  Expected output: Playwright downloads (or reports already-installed) the Chromium build used by the Pixel 7 device.

- [ ] **Step 3: Run the smoke test to see it PASS.** Run:
  ```bash
  pnpm test:e2e
  ```
  Expected output: global-setup creates `data/`, rebuilds and seeds `data/e2e.db` (`Database seeded successfully!`), the webServer builds and starts, then `1 passed` for the `mobile` project. (This test passes immediately because the login flow already exists; the value of the step is proving the scaffold — config, env, DB build, selectors — is wired correctly. If it fails, fix the scaffold, not the app. In particular, a failure on the "Welcome to Outlay" or "Dashboard" assertion means a selector regression, not an app bug.)

- [ ] **Step 4: Commit.** Run:
  ```bash
  git add e2e/login.spec.ts && git commit -m "test(e2e): add passcode-unlock login smoke test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 18: Add the .claude/rules note about the route announcer

A persistent rule so future tests don't reintroduce the flaky `getByRole("alert")` assertion. The `.claude/rules/` directory does not exist yet, so this creates both the directory and the file.

- [ ] **Step 1: Create `.claude/rules/playwright.md`** with complete contents:
  ```md
  # Playwright e2e rules

  ## Never assert `getByRole("alert")`

  The Next.js App Router renders a visually-hidden `role="alert"` live region
  (the route announcer) on every navigation. Asserting on `getByRole("alert")`
  will match that announcer — or race against it — producing flaky, misleading
  results. Target the specific element instead:

  - For form errors, use the rendered text, e.g.
    `page.getByText("Incorrect passcode.")` (the passcode-form error text from
    `src/lib/actions/auth-actions.ts:35`).
  - For headings, use `getByRole("heading", { name, level })` — but ONLY for
    real heading elements. The login "Welcome to Outlay" title is a CardTitle
    `<div data-slot="card-title">`, NOT a heading, so assert it with
    `getByText("Welcome to Outlay")`. The dashboard "Dashboard" title is a real
    `<h1>` (PageHeader) and can use `getByRole("heading", { level: 1 })`.
  - For inputs, use `getByPlaceholder(...)` or `getByLabel(...)`.

  ## Auth in e2e

  Use the shared-passcode path only. Google sign-in requires a real IdP and is
  out of scope for e2e. The passcode is `HOUSEHOLD_PASSCODE` from
  `playwright.config.ts`'s `webServer.env` (`e2e-pass`).
  ```

- [ ] **Step 2: Verify the file is created and untracked.** Run:
  ```bash
  git status --short .claude/rules/playwright.md
  ```
  Expected output: `?? .claude/rules/playwright.md`.

- [ ] **Step 3: Commit.** Run:
  ```bash
  git add .claude/rules/playwright.md && git commit -m "docs(e2e): add rule against getByRole(alert) route-announcer collision

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 19: Add a separate, non-blocking e2e CI job

A second job in `.github/workflows/ci.yml` that runs in parallel with `ci` (no `needs:`) and is non-blocking via `continue-on-error: true`, installs the Chromium browser with system deps, runs the suite, and uploads `playwright-report/` on failure with 7-day retention.

- [ ] **Step 1: Append the `e2e` job.** Modify `.github/workflows/ci.yml`. The file currently ends at line 47 (the `ci` job's `DATABASE_URL: ":memory:"`). Add the following as a new top-level entry under `jobs:` (after the entire `ci:` job, keeping two-space indentation consistent with the existing `ci:` key — `e2e:` must be a sibling of `ci:`, not nested inside it):
  ```yaml
  # Non-blocking: runs in parallel with `ci` (no `needs`) and never fails the
  # overall check (continue-on-error). e2e is a signal, not a gate, while the
  # suite is young; promote to blocking later by removing continue-on-error.
  e2e:
    runs-on: ubuntu-latest
    continue-on-error: true
    env:
      # Match the `ci` job: force remaining Node-20 actions onto Node 24.
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

      - name: Install Playwright browser
        run: pnpm exec playwright install --with-deps chromium

      - name: Run e2e tests
        run: pnpm test:e2e
        env:
          CI: "true"
          DATABASE_URL: file:./data/e2e.db
          AUTH_SECRET: e2e-secret
          HOUSEHOLD_PASSCODE: e2e-pass

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
  ```
  Notes: The job-level/step `env` (`DATABASE_URL`/`AUTH_SECRET`/`HOUSEHOLD_PASSCODE`) lets global-setup's `pnpm db:e2e` resolve the e2e DB before the webServer also injects its own `env`. `CI: "true"` makes the config use 2 retries, 1 worker, and the `github` reporter. global-setup runs `mkdirSync("data", …)` so the gitignored `data/` dir is created in the fresh CI checkout. The artifact upload runs only `if: failure()` so green runs upload nothing. Because `continue-on-error: true`, even though the upload is gated on `if: failure()`, a failing `Run e2e tests` step still triggers the upload step (the step-level failure is what `if: failure()` checks) and then the job is reported as a non-blocking pass.

- [ ] **Step 2: Validate workflow YAML syntax.** Run:
  ```bash
  python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml-ok')"
  ```
  Expected output: `yaml-ok` (parses cleanly with no exception). (`python3` and PyYAML ship on the macOS dev box and ubuntu runner; this is a more reliable parser check than an ad-hoc `js-yaml` CLI invocation.)

- [ ] **Step 3: Confirm two sibling top-level jobs exist.** Run:
  ```bash
  python3 -c "import yaml; j=yaml.safe_load(open('.github/workflows/ci.yml'))['jobs']; assert set(j)=={'ci','e2e'}, j; assert 'needs' not in j['e2e'], 'e2e must have no needs (parallel)'; assert j['e2e'].get('continue-on-error') is True, 'e2e must be non-blocking'; print('jobs ok: ci + e2e, parallel, non-blocking')"
  ```
  Expected output: `jobs ok: ci + e2e, parallel, non-blocking` (asserts both jobs are siblings under `jobs:`, the `e2e` job has no `needs:` so they run in parallel, and `continue-on-error` is set).

- [ ] **Step 4: Commit.** Run:
  ```bash
  git add .github/workflows/ci.yml && git commit -m "ci: add non-blocking parallel e2e job with report artifact

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit, one file changed.

### Task 20: Final full-suite verification

- [ ] **Step 1: Typecheck the whole project.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors.

- [ ] **Step 2: Lint.** Run:
  ```bash
  pnpm lint
  ```
  Expected output: no errors or warnings.

- [ ] **Step 3: Run unit + e2e suites.** Run:
  ```bash
  pnpm test && pnpm test:e2e
  ```
  Expected output: Vitest reports all unit tests passing, then Playwright reports `1 passed` for the `mobile` project.

- [ ] **Step 4: Confirm no stray e2e artifacts are tracked.** Run:
  ```bash
  git status --short
  ```
  Expected output: clean working tree (no untracked `data/e2e.db*`, `playwright-report/`, or `test-results/` — all gitignored).

### Task 21: Pin packageManager and engines (dependency discipline — spec §8.4)

**Files:**
- Modify: `/Users/nanda/vibe-code/outlay/package.json`

- [ ] **Step 1: Read the installed pnpm version.** Run:
  ```bash
  pnpm --version
  ```
  Expected output: a concrete version like `11.5.2`. Use exactly this value in the next step.

- [ ] **Step 2: Add `packageManager` and `engines` to package.json.** Insert these two top-level keys (after `"private": true`), using the pnpm version printed above and Node 24 (the version CI and the contract target):
  ```json
  "packageManager": "pnpm@11.5.2",
  "engines": {
    "node": ">=24"
  },
  ```
  This pins the package manager (so everyone resolves the same pnpm) and declares the Node floor. Do not invent a pnpm version — use the one from Step 1.

- [ ] **Step 3: Verify the install still succeeds with the pin.** Run:
  ```bash
  pnpm install
  ```
  Expected output: pnpm runs without a `packageManager` mismatch warning; `pnpm-lock.yaml` unchanged (no dependency edits).

- [ ] **Step 4: Typecheck and commit.** Run:
  ```bash
  pnpm exec tsc --noEmit
  ```
  Expected output: no errors. Then:
  ```bash
  git add package.json
  git commit -m "chore: pin packageManager (pnpm) and engines (node>=24)

  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
  ```
  Expected output: one commit recorded.
