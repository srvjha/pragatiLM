import type { Request, Response, NextFunction } from "express";
import { adminEnabled, isAdminEmail } from "@/config/env";
import { notFound, unauthorized } from "@/lib/errors";
import { requireUser } from "./session";
import { childLogger } from "@/lib/logger";

const log = childLogger("admin");

/**
 * The administrator gate.
 *
 * Runs after requireSession, and answers one question: is the signed in
 * account's email in ADMIN_EMAILS.
 *
 * Deliberately not a database column. There is no endpoint that grants admin,
 * nothing a compromised account can write to acquire it, and no migration that
 * can accidentally turn it on. Changing who has it requires access to the
 * server's environment, which is the level of ceremony the permission deserves:
 * an admin can read every account in the system and mint credit.
 *
 * Rejections are 404, not 403. A 403 confirms the panel exists and that the
 * caller simply lacks the key, which is a free hint. A 404 says nothing, and an
 * unconfigured deployment should not advertise that an admin panel is there at
 * all.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!adminEnabled) {
    next(notFound());
    return;
  }

  let email: string | null = null;
  try {
    email = requireUser(req).email;
  } catch {
    next(unauthorized("Sign in to continue."));
    return;
  }

  if (!isAdminEmail(email)) {
    // Logged because a non-admin reaching this is either a bug in the client or
    // somebody trying the URL, and both are worth seeing.
    log.warn({ email, path: req.originalUrl }, "rejected a non-admin request");
    next(notFound());
    return;
  }

  next();
}
