import { Router, type IRouter } from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GetOrdersResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const dataPath = fileURLToPath(new URL("../data/orders.json", import.meta.url));
let dataset: ReturnType<typeof GetOrdersResponse.parse> | undefined;

router.get("/orders", async (_req, res): Promise<void> => {
  if (!dataset) {
    dataset = GetOrdersResponse.parse(JSON.parse(await readFile(dataPath, "utf8")));
  }
  res.setHeader("Cache-Control", "private, max-age=300");
  res.json(dataset);
});

export default router;
