import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "coverage/**",
      "backend/worker-configuration.d.ts",
      "backend/src/index-old.ts",
      "docs/**",
      "backups/**",
      "deploy/**",
      "scripts/**",
      "backend/.wrangler/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["frontend/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Fast Refresh only applies to files that hold components. Provider files
    // may also export their hook; those names are listed explicitly.
    files: ["frontend/src/components/**/*.tsx", "frontend/src/pages/**/*.tsx"],
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
          allowCompoundComponents: true,
          allowExportNames: ["useContextMenu", "useToast"],
        },
      ],
    },
  },
  {
    // Service worker has no module scope: it runs with worker globals only.
    files: ["frontend/public/**/*.js"],
    languageOptions: {
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ["backend/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.serviceworker },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: [
      "*.config.{js,mjs,ts}",
      "eslint.config.mjs",
      "playwright.config.ts",
      "vitest.config.ts",
    ],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  eslintConfigPrettier,
);
