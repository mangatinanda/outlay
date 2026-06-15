// Shared Vitest setup: seed every required env var BEFORE any test module is
// imported. `@/lib/env` parses `process.env` eagerly at import time (and is
// reached transitively via `@/lib/db`, `@/auth`, `@/lib/gate`, etc.), so the
// required vars must already be present or the eager parse throws and the whole
// suite fails to load. `setupFiles` run before the test files' own imports.
//
// Use `??=` so a test that intentionally overrides a var in its own
// `vi.hoisted(...)` block still wins; we only fill the gaps.
process.env.DATABASE_URL ??= ":memory:";
process.env.AUTH_SECRET ??= "test-secret";
process.env.HOUSEHOLD_PASSCODE ??= "test-passcode";
