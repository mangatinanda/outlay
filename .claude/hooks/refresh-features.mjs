#!/usr/bin/env node
import { execSync, spawn } from "node:child_process";
/**
 * SessionEnd hook — keep the end-user FEATURES.md fresh.
 *
 * Refreshes FEATURES.md (via a headless `claude` run that follows
 * .claude/skills/features-doc/SKILL.md) ONLY when the app's feature surface has
 * actually changed this session. Designed to be safe and cheap:
 *
 *  - Recursion guard: the refresh run is spawned with CLAUDE_FEATURES_REFRESH=1,
 *    and this script no-ops when that's set — so the refresh's own SessionEnd
 *    can't spawn another refresh.
 *  - Staleness gate: hashes the feature surface (route files + server-action
 *    names + schema tables). If unchanged since the last run (stored in
 *    .claude/.features-fingerprint), it does nothing — unrelated sessions cost 0.
 *  - Non-blocking: the refresh is spawned DETACHED in the background, so the
 *    session ends immediately and the regen survives it.
 *  - Fail-open: any error exits 0 and never blocks session end.
 *
 * The refresh writes FEATURES.md but does NOT commit it (per the skill), so you
 * review and commit the change yourself.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

try {
  // 1. Recursion guard.
  if (process.env.CLAUDE_FEATURES_REFRESH === "1") process.exit(0);

  // 2. Fingerprint the feature surface.
  const sh = (cmd) =>
    execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  let surface;
  try {
    surface = [
      sh(
        "find src/app -type f \\( -name page.tsx -o -name route.ts \\) | sort",
      ),
      sh(
        'grep -rhoE "export const [A-Za-z0-9_]+ = safeAction" src/lib/actions | sort',
      ),
      sh(
        "grep -oE 'sqliteTable\\([[:space:]]*\"[a-z_]+\"' src/lib/db/schema.ts | sort",
      ),
    ].join("\n");
  } catch {
    process.exit(0); // not in the repo, or tools unavailable — skip silently
  }

  const fp = createHash("sha256").update(surface).digest("hex");
  const fpPath = ".claude/.features-fingerprint";
  const prev = existsSync(fpPath) ? readFileSync(fpPath, "utf8").trim() : "";
  if (fp === prev) process.exit(0); // surface unchanged → nothing to do

  // 3. Stale: record the new fingerprint, then refresh in a detached background run.
  writeFileSync(fpPath, `${fp}\n`);
  const child = spawn(
    "claude",
    [
      "-p",
      "Refresh FEATURES.md to reflect the app's current end-user features, following .claude/skills/features-doc/SKILL.md. Write the file but do not commit.",
    ],
    {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CLAUDE_FEATURES_REFRESH: "1" },
    },
  );
  child.unref();
  process.exit(0);
} catch {
  process.exit(0); // never block session end
}
