#!/usr/bin/env node
/**
 * Build-time migration guard.
 *
 * Applies pending Drizzle migrations ONLY when building against a real Turso
 * (production) database — i.e. TURSO_AUTH_TOKEN is set AND DATABASE_URL is a
 * `libsql://` URL. On local builds (file: DB), CI (`:memory:`), and Vercel
 * Preview (no DB env), it is a no-op, so those builds are unaffected.
 *
 * Wired as the first half of the `build` script (`node scripts/migrate-if-prod.mjs
 * && next build`) so production deploys auto-migrate before the new code serves.
 * `drizzle-kit migrate` is idempotent (it tracks applied migrations), so
 * re-deploys with no schema change are safe. A migration failure exits non-zero
 * and fails the build, so broken code never ships against an un-migrated DB.
 */
import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL ?? "";
const hasToken = (process.env.TURSO_AUTH_TOKEN ?? "").length > 0;
const isProdTurso = hasToken && url.startsWith("libsql://");

if (!isProdTurso) {
  const scheme = url.split("://")[0] || "unset";
  console.log(
    `[migrate-if-prod] skipping migrations (not a Turso prod build; DATABASE_URL scheme=${scheme}, TURSO_AUTH_TOKEN=${hasToken ? "set" : "unset"})`,
  );
  process.exit(0);
}

console.log(
  "[migrate-if-prod] Turso production env detected — applying migrations…",
);
try {
  execSync("pnpm exec drizzle-kit migrate", { stdio: "inherit" });
  console.log("[migrate-if-prod] migrations applied.");
} catch {
  console.error("[migrate-if-prod] migration failed — failing the build.");
  process.exit(1);
}
