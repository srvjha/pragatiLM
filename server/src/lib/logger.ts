import { pino, type Logger } from "pino";
import { env, isDevelopment } from "@/config/env";

export const logger: Logger = pino({
  // Tests assert on responses, not on log output, and request logging would bury
  // the failures that matter.
  level: env.NODE_ENV === "test" ? "silent" : isDevelopment ? "debug" : "info",
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
        },
      }
    : {}),
  base: { env: env.NODE_ENV },
});

export function childLogger(name: string) {
  return logger.child({ name });
}
