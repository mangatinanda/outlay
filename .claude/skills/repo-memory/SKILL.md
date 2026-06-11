---
name: repo-memory
description: Read and maintain this repository's working memory at `memory.md` (repo root). Consult it at the START of any non-trivial task in this repo to load context on what's been built, the key architectural decisions, and open items — before exploring the code. UPDATE it after completing significant work (a feature, a migration, a rename, a dependency upgrade, a notable bug fix, or a decision). Triggers on starting work in the Outlay repo, "what's the state of this project", "update the memory", or before/after substantial changes.
---

# Repo Memory (Outlay)

The repo keeps a single human- and agent-readable memory file at **`memory.md`** (repo root).
It is the fast path to understanding the project without re-deriving everything from the code.

## When you START work

1. **Read `memory.md` first** — before grepping or exploring. It tells you the stack, the auth
   model (passcode + Google coexisting), multi-household/currency conventions, key decisions, and
   the current open items.
2. Treat it as context, not gospel: it reflects what was true when last written. If it names a
   file, flag, or behavior, **verify it still exists** before relying on it, and fix the memory if
   it's stale.
3. `CLAUDE.md` holds the durable project rules; `memory.md` holds the evolving work log + state.

## When you FINISH significant work

Append/refresh `memory.md` — keep it tight (it's a memory, not a changelog of every line):

1. **Work log:** add a dated entry under `## Work log` — what changed and *why*, plus any
   decisions made. One short paragraph or a few bullets. Convert relative dates to absolute.
2. **Current state & open items:** update it — mark finished items done, add new open threads
   (uncommitted work, pending external steps, deferred decisions).
3. **Key decisions:** record any new architectural/product decision and its rationale.
4. **Snapshot / Stack / Architecture:** update only if they actually changed (rename, new core
   dependency, new convention).

### What counts as "significant"
Features, schema/DB changes, dependency upgrades, renames, auth/access changes, notable bug fixes
with a non-obvious root cause, and any decision the user made. Skip trivia (typos, one-line tweaks,
formatting) — those don't earn a memory entry.

## Style
- Be concise and specific: name files/flags/cookies/env vars, not vague summaries.
- Prefer updating an existing section over duplicating it.
- Don't paste large code; link to the file/path instead.
- This file is committed — write for the next engineer (human or agent), not for yourself.
