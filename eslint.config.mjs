// ESLint flat config — recommended defaults only (M1 lock: default/recommended configs).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/coverage/",
      "**/.next/", // Next.js build output (M7a)
      "apps/web/drizzle/", // drizzle-kit output, regenerated from schema.ts
      "docs/",
      "archive/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
