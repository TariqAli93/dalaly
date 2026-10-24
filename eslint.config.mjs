// ESLint catches defects; Prettier (`pnpm format`) owns formatting, so no
// stylistic rule is enabled here. Every rule is an error: add one only once
// the code passes it.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

const unusedVars = [
  "error",
  {
    args: "after-used",
    argsIgnorePattern: "^_",
    caughtErrors: "none",
    ignoreRestSiblings: true,
  },
];

// An empty catch is how these sources say "ignore this failure"; other
// empty blocks still fail.
const noEmpty = ["error", { allowEmptyCatch: true }];

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/desktop/release/**",
      "apps/desktop/build/**",
      "server/drizzle/**",
      "server/data/**",
      "perf-results/**",
      "tools/**",
      ".claude/**",
      ".claude-flow/**",
      ".swarm/**",
      // Repo tooling (perf harness, web demo) is not part of the app.
      "scripts/**",
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
  },

  // JavaScript: Electron main and preloads, the server's Node scripts.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-empty": noEmpty,
      "no-unused-vars": unusedVars,
    },
  },
  {
    files: ["**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },

  // TypeScript and Vue: the API, its scripts and the renderer. TypeScript
  // itself reports undefined names, so no-undef is off here.
  {
    files: ["**/*.{ts,mts,vue}"],
    extends: [js.configs.recommended, tseslint.configs.eslintRecommended],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2024,
      sourceType: "module",
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "no-empty": noEmpty,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": unusedVars,
    },
  },
  {
    files: ["server/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // The renderer's Vue files: template and SFC errors.
  {
    files: ["apps/renderer/**/*.vue"],
    extends: [pluginVue.configs["flat/essential"]],
    rules: {
      // Vuetify names table cell slots after the column key (#item.price).
      "vue/valid-v-slot": ["error", { allowModifiers: true }],
    },
  },
  {
    files: ["apps/renderer/**/*.{ts,vue}"],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
      },
    },
  },

  // An unawaited promise in application code loses its rejection; mark a
  // deliberate one with `void`. Test scripts are left out: node:test's
  // test() returns a promise nobody awaits.
  {
    files: ["server/src/**/*.ts", "apps/renderer/src/**/*.{ts,vue}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
    },
  },
);
