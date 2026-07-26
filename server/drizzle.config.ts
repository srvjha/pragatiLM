import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside the app, so it reads the connection string directly
// rather than importing src/config/env.ts and its path aliases.
const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
