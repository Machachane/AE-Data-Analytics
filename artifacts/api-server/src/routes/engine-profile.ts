import { Router, type IRouter } from "express";
import { GetEngineProfileResponse } from "@workspace/api-zod";
import { engineProfile } from "../lib/engine-profile";

const router: IRouter = Router();
router.get("/engine-profile", async (req, res): Promise<void> => {
  try {
    res.json(GetEngineProfileResponse.parse(await engineProfile()));
  } catch (error) {
    req.log.error({ err: error }, "Engine profile source could not be loaded");
    res.status(503).json({ error: "Engine profile source is temporarily unavailable. Please retry." });
  }
});
export default router;
