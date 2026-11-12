import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = fileURLToPath(new URL("../", import.meta.url));

// Real directory indexes let GitHub Pages serve every known module directly,
// without hash URLs, redirect query strings or a third-party SPA fallback.
export async function preparePages(outputDir, appSource) {
  const routes = [...appSource.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map((match) => match[1]);
  if (!routes.includes("/") || routes.length < 12) {
    throw new Error("Could not discover the dashboard module routes for GitHub Pages.");
  }
  const html = await readFile(path.join(outputDir, "index.html"), "utf8");
  for (const route of routes) {
    if (route === "/") continue;
    if (!/^\/[a-z0-9-]+$/.test(route)) throw new Error(`Unsupported static route: ${route}`);
    const dir = path.join(outputDir, route.slice(1));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), html);
  }
  await writeFile(path.join(outputDir, "404.html"), html);
  await writeFile(path.join(outputDir, ".nojekyll"), "");
  return routes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routes = await preparePages(
    path.join(appRoot, "dist/public"),
    await readFile(path.join(appRoot, "src/App.tsx"), "utf8"),
  );
  console.info(`Prepared ${routes.length} dashboard routes for GitHub Pages.`);
}
