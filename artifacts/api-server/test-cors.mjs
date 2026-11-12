import assert from "node:assert/strict";
import { test } from "node:test";
import cors from "cors";
import { allowedCorsOrigins, corsPolicy } from "./src/lib/cors-policy.ts";

test("explicit backend CORS allowlist accepts origins only", () => {
  assert.equal(allowedCorsOrigins().size, 0);
  const origins = allowedCorsOrigins("https://owner.github.io, https://dashboard.example.com");
  assert.ok(origins.has("https://owner.github.io"));
  assert.ok(!origins.has("https://untrusted.example"));
  for (const invalid of ["*", "https://owner.github.io/repo", "https://owner.github.io/", "http://public.example.com"]) {
    assert.throws(() => allowedCorsOrigins(invalid));
  }
});

test("real CORS middleware permits configured preflight and denies arbitrary origins", () => {
  for (const origin of ["https://owner.github.io", "https://untrusted.example"]) {
    const headers = new Map();
    const req = { method: "OPTIONS", headers: { origin,
      "access-control-request-method": "POST", "access-control-request-headers": "content-type" } };
    const res = {
      statusCode: 200,
      setHeader: (key, value) => headers.set(key.toLowerCase(), value),
      getHeader: (key) => headers.get(key.toLowerCase()),
      end: () => {},
    };
    cors(corsPolicy("https://owner.github.io"))(req, res, (error) => { assert.ifError(error); });
    if (origin === "https://owner.github.io") {
      assert.equal(headers.get("access-control-allow-origin"), origin);
      assert.match(headers.get("access-control-allow-methods"), /POST/);
      assert.match(headers.get("access-control-allow-headers"), /Content-Type/);
      assert.equal(res.statusCode, 204);
    } else assert.equal(headers.get("access-control-allow-origin"), undefined);
    assert.equal(headers.get("access-control-allow-credentials"), undefined);
  }
});
