import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deliveriesRouter from "./deliveries";
import ordersRouter from "./orders";
import utilisationRouter from "./utilisation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deliveriesRouter);
router.use(ordersRouter);
router.use(utilisationRouter);

export default router;
