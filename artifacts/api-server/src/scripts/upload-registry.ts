import { readFile } from "node:fs/promises";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const directory = new ObjectStorageService().getPrivateObjectDir().replace(/^\/+/, "");
const slash = directory.indexOf("/");
if (slash < 1) throw new Error("Private object directory is not configured correctly");
const bucket = objectStorageClient.bucket(directory.slice(0, slash));
const prefix = directory.slice(slash + 1).replace(/\/+$/, "");
const bytes = await readFile(new URL("../../../../generated-artifacts/aircraft-registry.json.gz", import.meta.url));
await bucket.file(`${prefix}/analytics/aircraft-registry.json.gz`).save(bytes, {
  resumable: false, metadata: { contentType: "application/gzip", cacheControl: "private, max-age=0" },
});
logger.info({ bytes: bytes.length }, "Stored aircraft registry snapshot");
