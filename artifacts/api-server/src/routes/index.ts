import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deliveriesRouter from "./deliveries";
import ordersRouter from "./orders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deliveriesRouter);
router.use(ordersRouter);

export default router;
