import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Root suite covers the OSS core only. The dashboard (packages/hosted/dashboard) has its
    // own vitest config (jsdom env + @/ alias) and is tested in its own package.
    include: ["packages/core/**/*.{test,spec}.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/core/src/**/*.ts"],
      exclude: [
        "packages/core/src/**/*.{test,spec}.ts",
        "packages/core/src/index.ts",   // CF Worker entry — requires CF runtime, not unit-testable
        "packages/core/src/proxy/index.ts", // re-export shim
      ],
      // Phase 1 complete — enforce ≥80% on core (CLAUDE.md + ROADMAP Phase 1 exit criterion).
      // Worker entry points (index.ts) excluded from threshold as they require a CF runtime.
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
