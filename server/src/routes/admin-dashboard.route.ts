import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireSession, requireUser } from "@/middleware/session";
import { requireAdmin } from "@/middleware/admin";
import { validate } from "@/middleware/validate";
import * as admin from "@/services/admin.service";

export const adminDashboardRouter: Router = Router();

/**
 * Everything here is behind requireSession then requireAdmin, applied to the
 * whole router rather than per route. Per route is one forgotten line away from
 * an open endpoint, and the endpoint that would leak is the one listing every
 * account in the system.
 */
adminDashboardRouter.use("/admin", requireSession, requireAdmin);

/** Whether the caller may see the dashboard at all, for the client to route on. */
adminDashboardRouter.get("/admin/me", (req: Request, res: Response) => {
  const user = requireUser(req);
  res.json({ data: { email: user.email, name: user.name } });
});

adminDashboardRouter.get("/admin/overview", (_req: Request, res: Response, next: NextFunction) => {
  admin
    .getOverview()
    .then((data) => res.json({ data }))
    .catch(next);
});

const daysQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

adminDashboardRouter.get(
  "/admin/signups",
  validate({ query: daysQuery }),
  (req: Request, res: Response, next: NextFunction) => {
    const { days } = req.query as unknown as z.infer<typeof daysQuery>;
    admin
      .getSignupSeries(days)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

const usersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

adminDashboardRouter.get(
  "/admin/users",
  validate({ query: usersQuery }),
  (req: Request, res: Response, next: NextFunction) => {
    const { limit } = req.query as unknown as z.infer<typeof usersQuery>;
    admin
      .listUsers(limit)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

adminDashboardRouter.get(
  "/admin/ai",
  validate({ query: daysQuery }),
  (req: Request, res: Response, next: NextFunction) => {
    const { days } = req.query as unknown as z.infer<typeof daysQuery>;
    admin
      .getAiByFeature(days)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

adminDashboardRouter.get(
  "/admin/performance",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }),
  (req: Request, res: Response, next: NextFunction) => {
    const { days } = req.query as unknown as { days: number };
    admin
      .getRoutePerformance(days)
      .then((data) => res.json({ data }))
      .catch(next);
  },
);

adminDashboardRouter.get("/admin/audit", (_req: Request, res: Response, next: NextFunction) => {
  admin
    .listAudit()
    .then((data) => res.json({ data }))
    .catch(next);
});

/**
 * The one write.
 *
 * Bounded at a thousand either way. An admin panel with an unbounded number
 * field is one fat finger from an account with ten million credits, and there
 * is no legitimate grant this size that cannot be made twice.
 */
const grantBody = z.object({
  userId: z.string().uuid(),
  credits: z
    .number()
    .int()
    .min(-1000)
    .max(1000)
    .refine((n) => n !== 0, "nothing to grant"),
  note: z.string().trim().min(1).max(200),
});

adminDashboardRouter.post(
  "/admin/grant",
  validate({ body: grantBody }),
  (req: Request, res: Response, next: NextFunction) => {
    const actor = requireUser(req);
    const body = req.body as z.infer<typeof grantBody>;

    admin
      .grantCredits({
        actor: { id: actor.id, email: actor.email },
        userId: body.userId,
        credits: body.credits,
        note: body.note,
      })
      .then((data) => res.json({ data }))
      .catch(next);
  },
);
