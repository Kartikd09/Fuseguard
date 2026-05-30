// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // The dashboard (Next.js) lints itself via its own Next ESLint config; exclude it +
    // all build artifacts / generated files from the root lint to avoid false errors.
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      "**/.wrangler/**",
      "**/.next/**",
      "packages/hosted/dashboard/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  prettier
);
