import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "@/lib/errors";

type Schemas = { body?: ZodType; params?: ZodType; query?: ZodType };

/**
 * NFR-5: every route validates input with zod and returns the same error
 * envelope. Parsed output replaces the raw input, so handlers receive coerced,
 * trimmed values rather than whatever arrived on the wire.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const key of ["body", "params", "query"] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      const result = schema.safeParse(req[key]);

      if (!result.success) {
        next(
          badRequest(
            `Invalid request ${key}`,
            result.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          ),
        );
        return;
      }

      // req.query has only a getter in Express 5, so it is redefined rather
      // than assigned.
      Object.defineProperty(req, key, { value: result.data, writable: true });
    }

    next();
  };
}
