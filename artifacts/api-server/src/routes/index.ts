import { Router, type IRouter } from "express";
import healthRouter from "./health";
import deliveriesRouter from "./deliveries";
import ordersRouter from "./orders";
import utilisationRouter from "./utilisation";
import aviationFinanceRouter from "./aviation-finance";
import marketRatesRouter from "./market-rates";
import emissionsRouter from "./emissions";
import registryRouter from "./registry";
import engineProfileRouter from "./engine-profile";
import jurisdictionRiskRouter from "./jurisdiction-risk";
import airlineFinancialsRouter from "./airline-financials";
import summaryRouter from "./summary";
import assistantRouter from "./assistant";
import feedbackRouter from "./feedback";
import teamAuthRouter from "./team-auth";
import { requireTeamSession, sameOriginWrite } from "../lib/team-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(sameOriginWrite);
router.use(teamAuthRouter);
router.use(requireTeamSession);
router.use(deliveriesRouter);
router.use(ordersRouter);
router.use(utilisationRouter);
router.use(aviationFinanceRouter);
router.use(marketRatesRouter);
router.use(emissionsRouter);
router.use(registryRouter);
router.use(engineProfileRouter);
router.use(jurisdictionRiskRouter);
router.use(airlineFinancialsRouter);
router.use(summaryRouter);
router.use(assistantRouter);
router.use(feedbackRouter);

export default router;
