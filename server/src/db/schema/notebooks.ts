import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const notebooks = pgTable(
  "notebooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The owner. Deleting a user takes their notebooks with them, which in turn
    // cascades to sources, chunks and chats. Vectors are not reachable from a
    // Postgres cascade, so the cleanup queue removes those separately.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notebooks_user_id_idx").on(table.userId)],
);

export type Notebook = typeof notebooks.$inferSelect;
export type NewNotebook = typeof notebooks.$inferInsert;
