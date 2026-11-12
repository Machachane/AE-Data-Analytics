const { test } = require("node:test");
const assert = require("node:assert/strict");
const { runInNewContext } = require("node:vm");
const { createElement } = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ThemeProvider } = require("next-themes");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

// Exercise the actual provider's pre-paint initialization with browser storage.
const markup = renderToStaticMarkup(createElement(ThemeProvider, {
  attribute: "class", storageKey: "ae-theme", defaultTheme: "dark",
  enableSystem: false, disableTransitionOnChange: true,
}, createElement("div")));
const script = markup.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, "Theme provider must initialize before painting the dashboard");

for (const saved of [null, "dark", "light"]) {
  test(`initial theme respects ${saved ?? "new visitor dark default"}`, () => {
    const classes = new Set(["dark"]);
    const root = {
      classList: {
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        add: (name) => classes.add(name),
      },
      style: {},
    };
    runInNewContext(script, {
      document: { documentElement: root },
      localStorage: { getItem: (key) => { assert.equal(key, "ae-theme"); return saved; } },
      window: {},
    });
    assert.equal(classes.has("dark"), saved !== "light");
    assert.equal(root.style.colorScheme, saved ?? "dark");
  });
}

test("all eleven modules use the shared theme control", () => {
  const src = join(__dirname, "..");
  const pages = ["summary", "airline-financials", "aviation-finance", "emissions",
    "engine-profile", "jurisdiction-risk", "market-rates", "registry", "utilisation"];
  const files = ["components/dashboard.tsx", ...pages.map((page) => `pages/${page}.tsx`)];
  for (const file of files) {
    const text = readFileSync(join(src, file), "utf8");
    assert.match(text, /<ThemeToggle /, `${file} must offer the toggle`);
    assert.match(text, /useDashboardTheme\(\)/, `${file} must share the preference`);
    assert.doesNotMatch(text, /localStorage.*ae-theme/, `${file} must not override the shared theme`);
  }
  for (const page of ["deliveries", "orders"]) {
    assert.match(readFileSync(join(src, `pages/${page}.tsx`), "utf8"), /<Dashboard /);
  }
});
