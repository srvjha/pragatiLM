import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { charge } from "@/services/billing/entitlements.service";
import { creditsFor, type BillableAction, type CreditCharge } from "@/billing/costs";
import { insufficientCredits, planRequired } from "@/lib/errors";
import { requireUser } from "@/middleware/session";

declare module "express-serve-static-core" {
  interface Request {
    /** The ledger reference this request was charged under, for a later refund. */
    creditRef?: string;
  }
}

/**
 * Charges for an action before its route runs.
 *
 * Middleware rather than a call inside each handler, for one reason: the failure
 * mode of a quota system is never that it was too strict, it is the one route
 * that forgot to ask. A handler cannot run without passing through this, and
 * adding a sixth way to create a source cannot accidentally be free.
 *
 * The charge happens here rather than after the work is created, so the gate and
 * the deduction are the same atomic operation. Checking first and charging later
 * would leave a window where two requests both pass a check they cannot both
 * afford — the exact race `spendCredits` exists to close.
 *
 * The consequence is that this charges for work that might then fail, which is
 * why it leaves `req.creditRef` behind: the job that does the work carries that
 * reference and refunds against it if it never delivers. Charging up front and
 * refunding on failure is deliberately preferred over charging on success,
 * because it means an expensive action can never be *started* by somebody who
 * cannot afford it, and because trusting every failure path to remember to
 * charge is how expensive things end up free.
 */
export function requireCredits(
  action: BillableAction,
  /**
   * How many of the action this request covers, when that is not one. The PDF
   * route accepts ten files in a single upload, and charging that as one source
   * would be a tenfold under-charge — so it must be mounted *after* the upload
   * parser, where the file count is known.
   */
  unitsFrom?: (req: Request) => number,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const user = requireUser(req);

    // Per request rather than per created row. Each send, upload or generate is
    // one chargeable action, and the row it produces does not exist yet. Job
    // level retries are made idempotent by the worker reusing this same ref.
    const ref = randomUUID();
    const units = unitsFrom ? unitsFrom(req) : 1;

    // Nothing to charge for. An upload with no files attached resolves to zero
    // units, and the handler is about to reject it with a 400 — taking a credit
    // for a request that stores nothing would be charging for our own error
    // message.
    if (units <= 0) {
      next();
      return;
    }

    charge(user.id, action, ref, { units })
      .then((result) => {
        if (result.ok) {
          req.creditRef = ref;
          next();
          return;
        }

        const cost = creditsFor(action) * units;

        if (result.reason === "not-on-plan") {
          next(
            planRequired(`Audio overviews are not included in the ${result.plan.name} plan.`, {
              action,
              plan: result.plan.code,
              needed: cost,
            }),
          );
          return;
        }

        next(
          insufficientCredits(
            `You have ${result.balance} credit${result.balance === 1 ? "" : "s"} left this period, and this needs ${cost}.`,
            { action, plan: result.plan.code, balance: result.balance, needed: cost },
          ),
        );
      })
      .catch(next);
  };
}

/**
 * The charge to hand to a background job, so it can give the credits back if it
 * never delivers.
 *
 * `ref` decides what "the same refund" means, and the right answer differs by
 * route:
 *
 * Pass the **artefact's id** when one request produces one artefact whose id is
 * fresh each time — a message, a podcast. It reads well in the ledger and a
 * retry of that artefact refunds once.
 *
 * Pass **nothing** when the artefact has no per-run id. A roadmap is one row per
 * notebook, replaced on every run, so keying the refund on the notebook would
 * refund the first failed run and silently swallow every later one. The default
 * is `req.creditRef`, which is unique per request and therefore per run.
 *
 * Never pass an id that several charges of one request share: an upload of ten
 * PDFs is charged ten credits, and each source must be able to refund
 * independently.
 *
 * Undefined when the request was not charged — a reindex, or an upload with
 * nothing attached — which the workers treat as nothing to refund.
 */
export function chargeFor(req: Request, ref?: string): CreditCharge | undefined {
  if (!req.creditRef) return undefined;
  return { userId: requireUser(req).id, ref: ref ?? req.creditRef };
}
