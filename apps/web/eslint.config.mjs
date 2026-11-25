import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      ".next/**",
      "out/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/cesium/**",
      "public/maplibre/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Plain scripts: the service worker files run in a worker, the icon script runs in Node.
    files: ["public/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: {
        self: "readonly",
        globalThis: "readonly",
        caches: "readonly",
        fetch: "readonly",
        importScripts: "readonly",
        Response: "readonly",
        URL: "readonly",
      },
    },
    rules: { "@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }] },
  },
  {
    // Tests index into known fixtures, so non-null assertions keep them readable.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        Buffer: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        fetch: "readonly",
        WebSocket: "readonly",
      },
    },
  },
  prettier,
);
