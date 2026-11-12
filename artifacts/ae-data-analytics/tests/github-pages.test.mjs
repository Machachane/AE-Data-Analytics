import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deploymentConfig } from "../src/lib/deployment-config.ts";
import { customFetch, setBaseUrl } from "../../../lib/api-client-react/src/custom-fetch.ts";
import { appRoot, preparePages } from "../scripts/prepare-pages.mjs";

test("Pages requires an HTTPS production backend origin, not a secret or preview", () => {
  assert.throws(() => deploymentConfig("github-pages"), /requires VITE_API_ORIGIN/);
  for (const bad of ["not a URL", "http://api.example.com", "https://user:pass@api.example.com",
    "https://api.example.com/api", "https://api.example.com?key=secret",
    "https://api.example.com/#fragment", "https://localhost", "https://127.0.0.1",
    "https://preview.riker.replit.dev"]) {
    assert.throws(() => deploymentConfig("github-pages", bad), /VITE_API_ORIGIN/);
  }
  assert.equal(deploymentConfig("github-pages", " https://api.example.com/ ").apiOrigin, "https://api.example.com");
});

test("root and repository bases validate; ordinary preview keeps same-origin API", () => {
  for (const base of ["/", "/AE-Analytics/"]) {
    assert.equal(deploymentConfig("github-pages", "https://api.example.com", base).basePath, base);
    assert.equal(deploymentConfig("development", undefined, base).apiOrigin, null);
  }
  for (const bad of ["relative/", "//evil.example/", "/repo", "/repo/?x=1", "/../", "/repo\\x/"]) {
    assert.throws(() => deploymentConfig("github-pages", "https://api.example.com", bad), /BASE_PATH/);
  }
});

test("all API methods and blob downloads share origin configuration without cross-site cookies", async () => {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    requests.push({ input, init });
    return new Response(init?.method === "POST" ? '{"id":1}' : "content", {
      headers: { "Content-Type": init?.method === "POST" ? "application/json" : "text/csv" },
    });
  };
  try {
    setBaseUrl("https://api.example.com/");
    for (const url of ["/api/summary", "/api/summary/export", "/api/registry/export", "/api/emissions/export", "/api/airline-financials/export"]) {
      const result = await customFetch(url + "?manufacturer=Boeing", { responseType: "blob" });
      assert.ok(result instanceof Blob);
      assert.equal(await result.text(), "content");
    }
    for (const url of ["/api/assistant/chat", "/api/feedback"]) {
      assert.deepEqual(await customFetch(url, { method: "POST", body: JSON.stringify({ message: "test" }), responseType: "json" }), { id: 1 });
    }
    assert.equal(requests.length, 7);
    for (const request of requests) {
      assert.ok(request.input.startsWith("https://api.example.com/api/"));
      assert.notEqual(request.init.credentials, "include");
    }
    setBaseUrl(null);
    await customFetch("/api/summary", { responseType: "text" });
    assert.equal(requests.at(-1).input, "/api/summary");
  } finally {
    setBaseUrl(null);
    globalThis.fetch = original;
  }
});

test("static route indexes preserve full HTML and support refresh on every module", async () => {
  const source = await readFile(path.join(appRoot, "src/App.tsx"), "utf8");
  for (const base of ["/", "/AE-Analytics/"]) {
    const dir = await mkdtemp(path.join(tmpdir(), "ae-pages-test-"));
    try {
      const html = `<html><script src="${base}assets/main.js"></script></html>`;
      await writeFile(path.join(dir, "index.html"), html);
      const routes = await preparePages(dir, source);
      assert.equal(routes.length, 12);
      assert.ok(routes.includes("/engine-profile"));
      assert.ok(routes.includes("/jurisdiction-risk"));
      for (const route of routes) {
        assert.equal(await readFile(path.join(dir, route, "index.html"), "utf8"), html);
      }
      assert.equal(await readFile(path.join(dir, "404.html"), "utf8"), html);
      assert.equal(await readFile(path.join(dir, ".nojekyll"), "utf8"), "");
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test("manual exports cannot bypass the common API client", async () => {
  for (const name of ["summary-table", "registry-table", "emissions-table", "airline-financials-table"]) {
    const source = await readFile(path.join(appRoot, `src/components/${name}.tsx`), "utf8");
    assert.match(source, /customFetch<Blob>/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
});
