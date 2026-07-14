import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";
import noUnsanitized from "eslint-plugin-no-unsanitized";
import globals from "globals";

// Getrennte Regel-Blöcke für Browser-Code (src/**, die React/Vite-App) und
// Node-Code (sidecar/**, vite.config.ts) -- analog zum Konzert-Guide-Ansatz
// (siehe dessen SECURITY_TOOLING.md), weil beide unterschiedliche
// Global-Objekte und Risiko-Profile haben: Browser-Code muss vor allem gegen
// XSS/DOM-Injection abgesichert sein (daher no-unsanitized), der Sidecar
// gegen z.B. Command-/Path-Injection (daher die zusätzlichen
// security/detect-*-Regeln zu fs/child_process im Node-Block).
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "sidecar/node_modules/**"],
  },

  // Browser-Code: die React/Vite-App selbst.
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

  // Node-Code: Vite-Config läuft im Node-Kontext des Dev-Servers, nicht im
  // Browser (Zugriff auf process, __dirname-Äquivalente etc.).
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

  // Node-Code: Browser-Sidecar (Express/Camoufox, CommonJS) -- läuft als
  // eigenständiger Container, hat mit dem Browser-Code der App nichts zu tun.
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
