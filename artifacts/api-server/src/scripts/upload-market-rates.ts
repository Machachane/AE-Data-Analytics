/** Persist only the validated valuation snapshot, never the 174 MB workbook in the app bundle. */
import { readFile } from "node:fs/promises";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const directory = new ObjectStorageService().getPrivateObjectDir().replace(/^\/+/, "");
const slash = directory.indexOf("/");
if (slash < 1) throw new Error("Private object directory is not configured correctly");
const bucket = objectStorageClient.bucket(directory.slice(0, slash));
const prefix = directory.slice(slash + 1).replace(/\/+$/, "");
const name = "market-value-lease-rates.json.gz";
const bytes = await readFile(new URL(`../../../../generated-artifacts/${name}`, import.meta.url));
await bucket.file(`${prefix}/analytics/${name}`).save(bytes, {
  resumable: false,
  metadata: { contentType: "application/gzip", cacheControl: "private, max-age=0" },
});
logger.info({ filename: name, bytes: bytes.length }, "Stored market value and lease rate snapshot");
