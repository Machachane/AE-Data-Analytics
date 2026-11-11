import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deliveriesRouter from "./deliveries";
import ordersRouter from "./orders";
import utilisationRouter from "./utilisation";
import aviationFinanceRouter from "./aviation-finance";
import marketRatesRouter from "./market-rates";
import emissionsRouter from "./emissions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(deliveriesRouter);
router.use(ordersRouter);
router.use(utilisationRouter);
router.use(aviationFinanceRouter);
router.use(marketRatesRouter);
router.use(emissionsRouter);

export default router;
