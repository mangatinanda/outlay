import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Seed required env vars before any test module loads. `@/lib/env` parses
    // process.env eagerly at import (reached via `@/lib/db`, `@/auth`, etc.),
    // so the required vars must exist before those imports run.
    // `vitest.setup.ts` adds @testing-library/jest-dom matchers + auto-cleanup
    // for the DOM-env component tests (opted in per-file via the
    // `// @vitest-environment happy-dom` pragma); it is inert for node-env
    // pure-function tests until one actually renders into a DOM.
    setupFiles: ["./src/test/setup-env.ts", "./vitest.setup.ts"],
  },
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json.
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
