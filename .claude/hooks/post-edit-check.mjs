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
