---
name: features-doc
description: Generate or refresh FEATURES.md — an end-user-facing overview of everything the Outlay app can do. Use when asked to update/refresh the features doc or "what the app does for users", and when invoked by the SessionEnd refresh hook (.claude/hooks/refresh-features.mjs). Writes for END USERS, not developers, grounded in the app's actual routes, server actions, and schema so it never drifts from reality.
---

# Features doc generator

Maintain **`FEATURES.md`** (repo root) as a plain-language, **end-user-facing**
overview of what Outlay can do — written for someone *using* the app, not a
developer. It is NOT a dev changelog.

## How to (re)generate it

1. **Survey the real feature surface** so the doc stays truthful (don't write from
   memory):
   - **Pages / user areas:** `find src/app -type f -name page.tsx` — each route is
     roughly one thing a user can do (`/dashboard`, `/expenses`, `/expenses/import`,
     `/settle-up`, `/activity`, `/members`, `/categories`, `/households`, `/settings`, …).
   - **Capabilities:** server actions in `src/lib/actions/`
     (`grep -rhoE "export const [A-Za-z0-9_]+ = safeAction" src/lib/actions`) and the
     read queries in `src/lib/queries/`.
   - **Data model:** tables in `src/lib/db/schema.ts`.
   - Cross-check `CLAUDE.md` and `memory.md` for product intent.
2. **Write `FEATURES.md`**, grouped by what the user can DO (e.g. track spending,
   organize, see insights, settle up, activity feed, multiple households,
   import/export, sign-in & sharing, install as an app). Use plain language and
   scannable bullets. **No file names, framework names, or internal jargon.**
3. Update the `_Last updated: YYYY-MM-DD_` line to today's date.
4. **Only list features the code actually supports.** If you're unsure a feature
   exists, verify it in the code or leave it out — never invent capabilities.

## Output rules

- Exactly one file: **`FEATURES.md`** at the repo root. Overwrite it in full.
- Keep the closing `<sub>…</sub>` note that explains it's auto-generated.
- **Do not commit** the file — leave it as a working-tree change for the human to
  review and commit, unless they explicitly ask you to commit it. (The SessionEnd
  refresh hook relies on this: it regenerates the file but never commits.)
