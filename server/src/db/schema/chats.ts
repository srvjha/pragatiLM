import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";
import { sources } from "./sources";
import { chunks } from "./chunks";
import { retrievalRuns } from "./retrieval-runs";
import { messageRoleEnum, messageStatusEnum } from "./enums";
import type { Locator } from "@/types/domain";

export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("chats_notebook_id_idx").on(table.notebookId)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull().default(""),
    status: messageStatusEnum("status").notNull().default("complete"),

    // The trace behind an assistant answer. Diagnostic, so losing it sets this
    // to null rather than removing the message.
    retrievalRunId: uuid("retrieval_run_id").references(() => retrievalRuns.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_chat_id_idx").on(table.chatId)],
);

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),

    // A removed source must not delete history. The answer keeps its citation
    // text and the UI marks the source as removed, per FR-2.11.
    sourceId: uuid("source_id").references(() => sources.id, { onDelete: "set null" }),
    chunkId: uuid("chunk_id").references(() => chunks.id, { onDelete: "set null" }),

    // The source's name and kind at the time of the answer, copied for the same
    // reason as the snippet. Deleting a source nulls sourceId above, and without
    // these a historic citation could not even say what it used to point at,
    // which is what FR-2.11 requires it to keep doing.
    sourceTitle: varchar("source_title", { length: 300 }).notNull().default(""),
    sourceType: varchar("source_type", { length: 16 }).notNull().default(""),

    // Snippet and locator are copied, not looked up. That is what lets an old
    // answer still resolve after the source has been re-indexed (FR-5.10).
    snippet: text("snippet").notNull(),
    locator: jsonb("locator").$type<Locator>().notNull(),
    score: integer("score"),
    markerIndex: integer("marker_index").notNull(),
  },
  (table) => [
    index("citations_message_id_idx").on(table.messageId),
    index("citations_source_id_idx").on(table.sourceId),
  ],
);

export type Chat = typeof chats.$inferSelect;
export type NewChat = typeof chats.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Citation = typeof citations.$inferSelect;
export type NewCitation = typeof citations.$inferInsert;
