import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    // templates/ are user-project starters with their own toolchain once copied.
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/out/**",
      "**/.vscode-test/**",
      "templates/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    files: ["apps/webview/src/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat.recommended,
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      "apps/extension/**/*.{ts,mjs}",
      "packages/**/*.ts",
      "*.{ts,mjs}",
      "apps/webview/vite.config.ts",
    ],
    languageOptions: { globals: globals.node },
  },
);
