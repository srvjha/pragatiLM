import { defineConfig } from "vitest/config";

/**
 * The web app's tests.
 *
 * `.mts` because this file is ESM and the config loader would otherwise read it
 * as CommonJS and warn on every run.
 *
 * No React plugin: esbuild handles the automatic JSX runtime straight from the
 * tsconfig, and adding one pulled in a Babel version that conflicts with what is
 * already installed. That plugin exists for Fast Refresh, which a test run has
 * no use for.
 *
 * Path aliases resolve natively rather than through vite-tsconfig-paths, which
 * Vite now reports as unnecessary.
 *
 * `NEXT_PUBLIC_API_URL` is set here because lib/api-client.ts throws at import
 * when it is missing — deliberately, so a misconfigured deployment fails loudly
 * instead of at the first request. Tests never reach the network.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    env: { NEXT_PUBLIC_API_URL: "http://localhost:4000" },
  },
});
