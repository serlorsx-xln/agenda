import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import globals from "globals";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const sharedRules = {
  "no-unused-vars": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "warn",
    {
      vars: "all",
      varsIgnorePattern: "^_",
      args: "after-used",
      argsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-require-imports": "off",
  "@typescript-eslint/ban-ts-comment": "off",
  "@typescript-eslint/no-empty-object-type": "off",
  "@typescript-eslint/no-unused-expressions": "off",
};

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/ltsm/**",
      "services/scb-slip-checker/**",
      "loadtest-report.json",
      "apps/web/next-env.d.ts",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    plugins: { "unused-imports": unusedImports },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: sharedRules,
  },
  {
    files: ["apps/web/**/*.{ts,tsx,js,mjs}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  ...compat.extends("next/core-web-vitals").map((cfg) => ({
    ...cfg,
    files: cfg.files ?? ["apps/web/**/*.{ts,tsx,js,mjs}"],
  })),
  {
    files: [
      "services/worker-line/**/*.{ts,js,mjs}",
      "packages/db/**/*.{ts,js,mjs}",
      "packages/shared/**/*.{ts,js,mjs}",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
