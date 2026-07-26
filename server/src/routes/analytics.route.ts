import { Router } from "express";
import { requireSession, requireUser } from "@/middleware/session";
import { getAnalytics } from "@/services/analytics.service";

export const analyticsRouter: Router = Router();

/**
 * Figures for the signed in user and nobody else. The scoping lives in the
 * queries themselves rather than in a filter applied afterwards, so there is
 * no shape of this request that returns another account's numbers.
 */
analyticsRouter.get("/analytics", requireSession, (req, res, next) => {
  getAnalytics(requireUser(req).id)
    .then((data) => res.json({ data }))
    .catch(next);
});
