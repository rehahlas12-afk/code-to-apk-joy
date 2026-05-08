import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzePlanRouter from "./analyzePlan";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzePlanRouter);

export default router;
