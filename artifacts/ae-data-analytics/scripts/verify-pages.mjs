import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { appRoot } from "./prepare-pages.mjs";

const base = process.env.BASE_PATH ?? "/";
const output = path.join(appRoot, "dist/public");
const html = await readFile(path.join(output, "index.html"), "utf8");
const source = await readFile(path.join(appRoot, "src/App.tsx"), "utf8");
const routes = [...source.matchAll(/<Route\s+path="(\/[^"]*)"/g)].map((match) => match[1]);
assert.equal(routes.length, 12);
for (const route of routes) {
  assert.equal(await readFile(path.join(output, route, "index.html"), "utf8"), html);
}
assert.equal(await readFile(path.join(output, "404.html"), "utf8"), html);
await access(path.join(output, ".nojekyll"));

const localAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((match) => match[1]).filter((url) => !url.startsWith("https://"));
assert.ok(localAssets.length >= 3, "Expected built JavaScript, CSS and favicon links");
for (const asset of localAssets) {
  assert.ok(asset.startsWith(base), `Asset does not use BASE_PATH: ${asset}`);
  await access(path.join(output, asset.slice(base.length)));
}
for (const file of ["gari-logo.webp", "estuaire-logo.webp", "tiralis-global-logo.webp"]) {
  await access(path.join(output, file));
}
// The upload must be static output only, never original workbooks or server data.
const allowedTopLevel = new Set(["index.html", "404.html", ".nojekyll", "assets", "favicon.svg",
  "robots.txt", "gari-logo.webp", "estuaire-logo.webp", "tiralis-global-logo.webp",
  ...routes.filter((route) => route !== "/").map((route) => route.slice(1))]);
for (const name of await readdir(output)) {
  assert.ok(allowedTopLevel.has(name), `Review unexpected file before publishing: ${name}`);
}
console.info(`Verified built Pages assets and ${routes.length} routes at ${base}`);
