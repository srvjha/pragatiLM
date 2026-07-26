import { defineConfig } from "tsup";

// Both process entrypoints are bundled, which is also what resolves the "@/*"
// path alias at build time. tsx handles the same resolution in development.
export default defineConfig({
  entry: ["src/index.ts", "src/worker.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
});
