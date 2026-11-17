/** Upload validated finance snapshots and archive their original workbooks privately. */
import { readFile } from "node:fs/promises";
import { gzipSync, gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { GetAviationFinanceResponse } from "@workspace/api-zod";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const directory = new ObjectStorageService().getPrivateObjectDir().replace(/^\/+/, "");
const slash = directory.indexOf("/");
if (slash < 1) throw new Error("Private object directory is not configured correctly");
const bucket = objectStorageClient.bucket(directory.slice(0, slash));
const prefix = directory.slice(slash + 1).replace(/\/+$/, "");
const borrowersOnly = process.argv.includes("--borrowers-only");
const mlaOnly = process.argv.includes("--mla-only");
assert(!(borrowersOnly && mlaOnly), "Choose only one dataset replacement mode");
const files = [
  ["generated-artifacts/aviation-finance.json.gz", "aviation-finance.json.gz", "application/gzip"],
  ["attached_assets/MLA_CM_CO_MERGED_1794903647939.xlsx", "source-mla-finance.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["attached_assets/BORROWER_transposed_1794903280927.xlsx", "source-borrower-finance.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["attached_assets/Aviation_Analyses_1794423357544.xlsx", "source-aviation-analyses.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
];

if (borrowersOnly || mlaOnly) {
  const target = bucket.file(`${prefix}/analytics/aviation-finance.json.gz`);
  const [beforeBytes] = await target.download();
  const before = JSON.parse(gunzipSync(beforeBytes).toString("utf8"));
  const extracted = JSON.parse(gunzipSync(await readFile(new URL("../../../../generated-artifacts/aviation-finance.json.gz", import.meta.url))).toString("utf8"));
  const field = mlaOnly ? "mla" : "borrowers";
  const rows = mlaOnly
    ? GetAviationFinanceResponse.shape.mla.parse(extracted.mla)
    : GetAviationFinanceResponse.shape.borrowers.parse(extracted.borrowers);
  assert(rows.length > 0, "Replacement must not be empty");
  assert(rows.every(r => r.name.trim() && r.deals >= 0 && ["Q1", "Q2", "H1", "Q3", "Q4", "H2", "YR"].includes(r.period)), "Invalid finance records");
  if (mlaOnly) {
    for (const r of GetAviationFinanceResponse.shape.mla.parse(rows)) {
      assert(Math.abs(r.total - r.capitalMarkets - r.commercial) <= 0.01, "Invalid MLA totals");
    }
  }
  const replacement = { ...before, [field]: rows };
  // Archive the prior snapshot before replacing it; preserve all unrelated source fields.
  await bucket.file(`${prefix}/analytics/archive/aviation-finance-${Date.now()}.json.gz`).save(beforeBytes, {
    resumable: false, metadata: { contentType: "application/gzip", cacheControl: "private, max-age=0" },
  });
  const sourcePath = mlaOnly ? "attached_assets/MLA_CM_CO_MERGED_1794903647939.xlsx" : "attached_assets/BORROWER_transposed_1794903280927.xlsx";
  const source = await readFile(new URL(`../../../../${sourcePath}`, import.meta.url));
  await bucket.file(`${prefix}/analytics/${mlaOnly ? "source-mla-finance.xlsx" : "source-borrower-finance.xlsx"}`).save(source, {
    resumable: false, metadata: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", cacheControl: "private, max-age=0" },
  });
  await target.save(gzipSync(JSON.stringify(replacement)), {
    resumable: false, metadata: { contentType: "application/gzip", cacheControl: "private, max-age=0" },
  });
  const [verifiedBytes] = await target.download();
  const verified = JSON.parse(gunzipSync(verifiedBytes).toString("utf8"));
  assert.deepEqual(verified, replacement);
  assert.deepEqual(verified[mlaOnly ? "borrowers" : "mla"], before[mlaOnly ? "borrowers" : "mla"]);
  assert.deepEqual(verified.analyses, before.analyses);
  logger.info({ dataset: field, rows: rows.length }, "Replaced and verified finance dataset; other finance data unchanged");
} else {
for (const [source, name, contentType] of files) {
  const bytes = await readFile(new URL(`../../../../${source}`, import.meta.url));
  await bucket.file(`${prefix}/analytics/${name}`).save(bytes, {
    resumable: false,
    metadata: { contentType, cacheControl: "private, max-age=0" },
  });
  logger.info({ filename: name, bytes: bytes.length }, "Stored finance source");
}
}
