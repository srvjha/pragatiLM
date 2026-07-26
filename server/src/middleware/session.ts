import type { NextFunction, Request, RequestHandler, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@/lib/auth";
import { unauthorized } from "@/lib/errors";

export type SessionUser = { id: string; name: string; email: string; image: string | null };

declare module "express-serve-static-core" {
  interface Request {
    user?: SessionUser;
  }
}

/**
 * The authentication boundary for every data route.
 *
 * This is the real enforcement point. The web app also hides signed out
 * surfaces, but that is presentation: a request arriving without a valid
 * session is refused here regardless of what any client believes.
 */
export const requireSession: RequestHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  auth.api
    .getSession({ headers: fromNodeHeaders(req.headers) })
    .then((session) => {
      if (!session?.user) {
        next(unauthorized("Sign in to continue."));
        return;
      }

      req.user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
      };
      next();
    })
    .catch(next);
};

/** Reads the user the middleware above resolved. */
export function requireUser(req: Request): SessionUser {
  if (!req.user) throw new Error("requireSession must run before this handler");
  return req.user;
}
