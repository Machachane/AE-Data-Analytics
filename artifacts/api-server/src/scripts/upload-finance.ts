/** Upload validated finance snapshots and archive their original workbooks privately. */
import { readFile } from "node:fs/promises";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const directory = new ObjectStorageService().getPrivateObjectDir().replace(/^\/+/, "");
const slash = directory.indexOf("/");
if (slash < 1) throw new Error("Private object directory is not configured correctly");
const bucket = objectStorageClient.bucket(directory.slice(0, slash));
const prefix = directory.slice(slash + 1).replace(/\/+$/, "");
const files = [
  ["generated-artifacts/aviation-finance.json.gz", "aviation-finance.json.gz", "application/gzip"],
  ["attached_assets/MLA_CM_CO_MERGED_1794423040817.xlsx", "source-mla-finance.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["attached_assets/BORROWER_transposed_1794423117428.xlsx", "source-borrower-finance.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["attached_assets/Aviation_Analyses_1794423357544.xlsx", "source-aviation-analyses.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
];

for (const [source, name, contentType] of files) {
  const bytes = await readFile(new URL(`../../../../${source}`, import.meta.url));
  await bucket.file(`${prefix}/analytics/${name}`).save(bytes, {
    resumable: false,
    metadata: { contentType, cacheControl: "private, max-age=0" },
  });
  logger.info({ filename: name, bytes: bytes.length }, "Stored finance source");
}
