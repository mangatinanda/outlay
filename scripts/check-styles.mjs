#!/usr/bin/env node
// Mechanizes the token-only styling invariants documented in
// `.claude/rules/ui.md` so they fail CI / pre-commit instead of relying on a
// human (or an agent) remembering to read the markdown rule. This is the
// "promote a repeat review comment to a lint rule" move: the design system
// says "use semantic tokens, never hardcoded colors / raw palette shades /
// arbitrary radii / custom shadows / direct clsx", and this script enforces it.
//
// Scope: authored app code only — `src/components/**` and `src/app/**`
// (`.tsx`/`.ts`), EXCLUDING:
//   - `src/components/ui/**` — shadcn-generated primitives (ui.md: "Do not fork
//     shadcn"); they legitimately use token-driven arbitrary values like
//     `rounded-[min(var(--radius-md),10px)]`.
//   - `*.test.*` — test files.
//
// Escape hatch: put `ui-lint-ignore` in a comment on the offending line or the
// line directly above it (mirrors the `biome-ignore` convention). Use it only
// for deliberate, documented exceptions (e.g. brand colors with no token).
//
// Usage:
//   node scripts/check-styles.mjs                 # scan the whole authored tree
//   node scripts/check-styles.mjs <files...>      # scan specific files (lint-staged)
// Exits 1 if any violation is found, 0 otherwise.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SCAN_DIRS = ["src/components", "src/app"];
const IGNORE_MARKER = "ui-lint-ignore";

// Each rule: a regex plus the fix to point people at. Kept deliberately narrow
// (numbered palette shades, bracketed color literals, etc.) so it has near-zero
// false positives — it only fires on things that are unambiguously off-system.
const RULES = [
  {
    id: "hardcoded-color",
    // A color literal inside a Tailwind arbitrary value, e.g. bg-[#fff],
    // text-[rgb(0,0,0)], [color:hsl(...)]. Does NOT match quoted data hex like
    // "#6366f1" (category palette values) — those aren't in `[...]`.
    re: /\[(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|oklch\()/,
    msg: "hardcoded color in a Tailwind arbitrary value — use a semantic token (bg-*/text-*/border-*/ring-*).",
  },
  {
    id: "inline-style-color",
    // A literal color inside an inline style={{ ... }} (single-line). Dynamic
    // values like style={{ backgroundColor: cat.color }} are fine and won't match.
    re: /style=\{\{[^}]*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/,
    msg: "literal color in an inline style — drive it from a token or a data value, not a hardcoded literal.",
  },
  {
    id: "raw-palette",
    // Raw Tailwind palette shade (text-red-500, bg-emerald-600, ...) instead of
    // a semantic token. Token names (bg-muted, text-foreground) don't match.
    re: /\b(?:bg|text|border|ring|ring-offset|from|to|via|fill|stroke|divide|outline|decoration|placeholder|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/,
    msg: "raw Tailwind palette color — use a semantic token (see .claude/rules/ui.md). Deliberate exception? add `ui-lint-ignore`.",
  },
  {
    id: "arbitrary-radius",
    re: /\brounded-\[/,
    msg: "literal radius — use rounded-sm|md|lg|xl|2xl|3xl|4xl (driven by --radius).",
  },
  {
    id: "arbitrary-shadow",
    re: /\bshadow-\[/,
    msg: "custom shadow — use the named shadow-card|shadow-float|shadow-pop utilities.",
  },
  {
    id: "direct-clsx",
    re: /\bclsx\s*\(/,
    msg: "merge classes with cn() from @/lib/utils, not clsx() directly.",
  },
];

function isScannable(path) {
  const rel = relative(ROOT, path).replaceAll("\\", "/");
  if (!/\.(tsx?|jsx?)$/.test(rel)) return false;
  if (/\.test\./.test(rel)) return false;
  if (rel.startsWith("src/components/ui/")) return false;
  return SCAN_DIRS.some((d) => rel === d || rel.startsWith(`${d}/`));
}

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && isScannable(full)) out.push(full);
  }
}

function collectFiles(argv) {
  if (argv.length > 0) {
    return argv
      .map((p) => resolve(ROOT, p))
      .filter((p) => {
        try {
          return statSync(p).isFile() && isScannable(p);
        } catch {
          return false;
        }
      });
  }
  const out = [];
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d), out);
  return out;
}

function checkFile(path) {
  const violations = [];
  const lines = readFileSync(path, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prev = i > 0 ? lines[i - 1] : "";
    if (line.includes(IGNORE_MARKER) || prev.includes(IGNORE_MARKER)) continue;
    for (const rule of RULES) {
      const m = rule.re.exec(line);
      if (m) {
        violations.push({
          line: i + 1,
          col: m.index + 1,
          rule: rule.id,
          msg: rule.msg,
          snippet: line.trim().slice(0, 100),
        });
      }
    }
  }
  return violations;
}

const files = collectFiles(process.argv.slice(2));
let total = 0;
for (const f of files) {
  const violations = checkFile(f);
  if (violations.length === 0) continue;
  const rel = relative(ROOT, f);
  for (const v of violations) {
    total++;
    console.error(`${rel}:${v.line}:${v.col}  [${v.rule}] ${v.msg}`);
    console.error(`    ${v.snippet}`);
  }
}

if (total > 0) {
  console.error(
    `\n✖ ${total} styling violation(s). See .claude/rules/ui.md. ` +
      `For a deliberate exception, add \`${IGNORE_MARKER}\` on/above the line.`,
  );
  process.exit(1);
}

console.log(`✓ ui.md styling rules: ${files.length} file(s) clean.`);
