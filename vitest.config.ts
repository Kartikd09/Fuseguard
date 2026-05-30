import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/**/src/**/*.ts"],
      exclude: ["packages/**/src/**/*.{test,spec}.ts", "packages/hosted/**"],
      // Phase 1 complete — enforce ≥80% on core (CLAUDE.md + ROADMAP Phase 1 exit criterion).
      // Worker entry points (index.ts) excluded from threshold as they require a CF runtime.
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
