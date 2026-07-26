import { pgTable, uuid, text, integer, timestamp, customType, index } from "drizzle-orm/pg-core";
import { sources } from "./sources";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

/**
 * Stored bytes live in their own table rather than as a column on sources, so a
 * source listing never drags a 50 MB PDF through the connection. One row per
 * artefact, keyed by source, distinguished by kind:
 *
 *   original  the uploaded file, rendered by the PDF viewer and offered as the
 *             download fallback when a document cannot be rendered
 *   captured  the cleaned reader view of a web page, captured at ingestion so
 *             the viewer still works if the site later goes down or blocks us
 *
 * Postgres TOASTs these out of line and compresses them, so the row itself stays
 * small. This is the storage tier for a single user local product; a deployment
 * serving many users would move these bytes to object storage and leave the rest
 * of the schema untouched.
 */
export const sourceFiles = pgTable(
  "source_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["original", "captured"] }).notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    bytes: bytea("bytes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("source_files_source_id_kind_idx").on(table.sourceId, table.kind)],
);

export type SourceFile = typeof sourceFiles.$inferSelect;
export type NewSourceFile = typeof sourceFiles.$inferInsert;
