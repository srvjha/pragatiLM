import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";
import { artifactStatusEnum, podcastStageEnum, roadmapLevelEnum } from "./enums";
import type { PodcastTurn, RoadmapModule } from "@/types/domain";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const roadmaps = pgTable(
  "roadmaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    level: roadmapLevelEnum("level").notNull(),
    goal: text("goal"),
    modules: jsonb("modules").$type<RoadmapModule[]>().notNull().default([]),
    /**
     * Which sources it was built from. Empty means every timed source in the
     * notebook, which is what the roadmap always used to do implicitly.
     */
    sourceIds: jsonb("source_ids").$type<string[]>().notNull().default([]),
    status: artifactStatusEnum("status").notNull().default("QUEUED"),
    /**
     * Stage and progress, the same pair a source carries while it indexes.
     * Generation is one long model call, so this reports which stage it is in
     * rather than pretending to measure the call itself.
     */
    statusStage: text("status_stage"),
    progress: integer("progress").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("roadmaps_notebook_id_idx").on(table.notebookId)],
);

export const podcasts = pgTable(
  "podcasts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notebookId: uuid("notebook_id")
      .notNull()
      .references(() => notebooks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    script: jsonb("script").$type<PodcastTurn[]>().notNull().default([]),
    durationSec: integer("duration_sec"),

    status: artifactStatusEnum("status").notNull().default("QUEUED"),
    stage: podcastStageEnum("stage"),
    progress: integer("progress").notNull().default(0),
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("podcasts_notebook_id_idx").on(table.notebookId)],
);

/** Same reasoning as source_files: audio bytes stay out of the listing query. */
export const podcastAudio = pgTable("podcast_audio", {
  id: uuid("id").primaryKey().defaultRandom(),
  podcastId: uuid("podcast_id")
    .notNull()
    .references(() => podcasts.id, { onDelete: "cascade" }),
  mimeType: text("mime_type").notNull().default("audio/mpeg"),
  sizeBytes: integer("size_bytes").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PodcastAudio = typeof podcastAudio.$inferSelect;
export type NewPodcastAudio = typeof podcastAudio.$inferInsert;
export type Roadmap = typeof roadmaps.$inferSelect;
export type NewRoadmap = typeof roadmaps.$inferInsert;
export type Podcast = typeof podcasts.$inferSelect;
export type NewPodcast = typeof podcasts.$inferInsert;
