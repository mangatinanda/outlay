import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Seed required env vars before any test module loads. `@/lib/env` parses
    // process.env eagerly at import (reached via `@/lib/db`, `@/auth`, etc.),
    // so the required vars must exist before those imports run.
    setupFiles: ["./src/test/setup-env.ts"],
  },
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json.
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
