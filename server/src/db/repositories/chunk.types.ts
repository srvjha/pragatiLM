import type { chunks } from "@/db/schema";

/**
 * The generated tsvector is not selectable as a normal column value, so rows are
 * typed without it. Nothing outside Postgres ever needs to read it.
 */
export type ChunkRow = Omit<typeof chunks.$inferSelect, "tsv">;
