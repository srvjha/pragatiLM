import { defineConfig } from "tsup";

// Both process entrypoints are bundled, which is also what resolves the "@/*"
// path alias at build time. tsx handles the same resolution in development.
export default defineConfig({
  // The migrator is a third entrypoint so a deployment can apply migrations
  // with the same built image, rather than needing tsx and the dev tree on the
  // server to run a TypeScript file.
  entry: ["src/index.ts", "src/worker.ts", "src/db/migrate.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
});
