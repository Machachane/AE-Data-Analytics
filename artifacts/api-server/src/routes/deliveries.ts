import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GetDeliveriesResponse } from "@workspace/api-zod";

const router: IRouter = Router();
// Resolve from the built server bundle, so the same path works after publishing.
const dataPath = fileURLToPath(new URL("../data/deliveries.json", import.meta.url));
let dataset: ReturnType<typeof GetDeliveriesResponse.parse> | undefined;

router.get("/deliveries", async (_req, res): Promise<void> => {
  if (!dataset) {
    dataset = GetDeliveriesResponse.parse(JSON.parse(await readFile(dataPath, "utf8")));
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  res.json(dataset);
});

export default router;
