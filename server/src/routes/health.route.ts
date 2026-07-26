import { Router } from "express";
import { checkHealth } from "@/services/health.service";

export const healthRouter: Router = Router();

healthRouter.get("/health", (_req, res, next) => {
  checkHealth()
    .then((report) => {
      res.status(report.status === "ok" ? 200 : 503).json({ data: report });
    })
    .catch(next);
});
