import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // Mirror the `@/*` path alias from tsconfig.json.
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
