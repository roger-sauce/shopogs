import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import globals from "globals";

// Separate rule blocks for browser code (src/**, the React/Vite app) and Node
// code (sidecar/**, vite.config.ts) -- following the konzert-guide approach
// (see its SECURITY_TOOLING.md), because the two have different global
// objects and risk profiles: browser code has to be secured above all against
// XSS/DOM injection (hence no-unsanitized), the sidecar against e.g.
// command/path injection (hence the additional security/detect-* rules for
// fs/child_process in the Node block).
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "sidecar/node_modules/**"],
  },

  // Browser code: the React/Vite app itself.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      security,
      "no-unsanitized": noUnsanitized,
    },
    rules: {
      "security/detect-object-injection": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "warn",
      "no-unsanitized/property": "error",
      "no-unsanitized/method": "error",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Node code: the Vite config runs in the Node context of the dev server, not
  // in the browser (access to process, __dirname equivalents etc.).
  {
    files: ["vite.config.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    plugins: {
      security,
    },
    rules: {
      "security/detect-object-injection": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "warn",
    },
  },

  // Node code: browser sidecar (Express/Camoufox, CommonJS) -- runs as a
  // standalone container, has nothing to do with the app's browser code.
  {
    files: ["sidecar/src/**/*.js", "sidecar/scripts/**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      sourceType: "commonjs",
      globals: globals.node,
    },
    plugins: {
      security,
    },
    rules: {
      "security/detect-object-injection": "warn",
      "security/detect-unsafe-regex": "error",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-child-process": "error",
    },
  }
);
