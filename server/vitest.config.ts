import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup.ts"],
    // The suite shares one Postgres database, so files run in sequence rather
    // than truncating each other's rows mid test.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
  },
});
