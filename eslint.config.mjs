// Shared ESLint flat config for the framework-free packages in packages/*.
// apps/web has its own config that extends the Next.js rules.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "apps/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      // Shared packages must stay portable to React Native, so no DOM globals.
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage"],
    },
  },
  prettier,
);
