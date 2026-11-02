import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.wrangler/**",
      "**/target/**",
      "packages/sql_guard/pkg/**",
      "**/next-env.d.ts",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: { "no-undef": "off", "@typescript-eslint/no-unused-vars": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "**/*investigation*.ts",
      "**/*Failure.ts",
      "**/investigation/**/*.tsx",
      "packages/shared/src/{validation,classify,normalize}.ts",
    ],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
);
