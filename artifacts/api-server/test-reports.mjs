import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const file = new URL("./dist/dashboard-report-checks.mjs", import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL("./src/lib/dashboard-report.test.ts", import.meta.url))],
  outfile: fileURLToPath(file), bundle: true, platform: "node", format: "esm",
  external: ["pdfkit", "@google-cloud/*", "google-auth-library"],
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
await import(file.href + `?run=${Date.now()}`);
