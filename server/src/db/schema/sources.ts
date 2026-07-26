import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";
import { sourceTypeEnum, sourceStatusEnum } from "./enums";
import type { SourceMetadata } from "@/types/domain";

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    type: sourceTypeEnum("type").notNull(),
    title: text("title").notNull(),

    status: sourceStatusEnum("status").notNull().default("QUEUED"),
    // Free text detail within the status, for example "page 12 of 40". The dot
    // colour comes from status; this drives the tooltip.
    statusStage: text("status_stage"),
    progress: integer("progress").notNull().default(0),
    errorMessage: text("error_message"),

    // FR-2.14: only checked sources are retrieved from. Checked by default.
    selected: boolean("selected").notNull().default(true),

    originalUrl: text("original_url"),
    contentHash: text("content_hash").notNull(),

    metadata: jsonb("metadata").$type<SourceMetadata>().notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    indexedAt: timestamp("indexed_at", { withTimezone: true }),
  },
  (table) => [
    index("sources_notebook_id_idx").on(table.notebookId),
    index("sources_status_idx").on(table.status),
    // FR-2.15: the same file added twice to one notebook is a duplicate, but the
    // same file in two notebooks is not.
    uniqueIndex("sources_notebook_content_hash_key").on(table.notebookId, table.contentHash),
  ],
);

export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
