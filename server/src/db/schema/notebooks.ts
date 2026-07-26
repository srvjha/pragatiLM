import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";

export const notebooks = pgTable(
  "notebooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // v1 assumes a single local user. The column is reserved now so that adding
    // auth later is additive rather than a migration of every child table.
    userId: uuid("user_id"),
    name: varchar("name", { length: 80 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("notebooks_user_id_idx").on(table.userId)],
);

export type Notebook = typeof notebooks.$inferSelect;
export type NewNotebook = typeof notebooks.$inferInsert;
