import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      ".mypy_cache/",
      ".pytest_cache/",
      ".runtime_tmp/",
      ".ruff_cache/",
      ".venv/",
      "coverage/",
      "dist/",
      "node_modules/",
      "playwright-report/",
      "python/",
      "release/",
      "test-results/",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
