import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/**/src/**/*.ts"],
      exclude: ["packages/**/src/**/*.{test,spec}.ts", "packages/hosted/**"],
      // Enforce once Phase 1 implements packages/core (CLAUDE.md: ≥80% on core).
      // thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
