import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone plain-JS service worker: never imported by the app, and the
    // Next/TS parser can't handle its file layout (parsing error at 182:0).
    "public/sw.js",
    // Vendored minified pdf.js worker: content-fixed per pdfjs-dist release,
    // never imported by app code, and linting it emits thousands of warnings
    // that drown out real findings.
    "public/pdfjs/**",
    // Tool/VCS/editor scratch dirs — never project source.
    ".kilo/**",
    ".vercel/**",
    ".vscode/**",
  ]),
]);

export default eslintConfig;
