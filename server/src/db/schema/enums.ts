import { pgEnum } from "drizzle-orm/pg-core";

export const sourceTypeEnum = pgEnum("source_type", ["PDF", "TEXT", "WEB", "YOUTUBE", "VTT"]);

/**
 * The full lifecycle. The UI collapses these into four dots (grey uploading,
 * yellow indexing, green ready, red failed) but the detailed stage is what the
 * worker writes and what the tooltip shows.
 */
export const sourceStatusEnum = pgEnum("source_status", [
  "QUEUED",
  "UPLOADING",
  "EXTRACTING",
  "CHUNKING",
  "EMBEDDING",
  "READY",
  "FAILED",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const messageStatusEnum = pgEnum("message_status", [
  "streaming",
  "complete",
  "stopped",
  "error",
]);

export const roadmapLevelEnum = pgEnum("roadmap_level", ["new", "some", "experienced"]);

export const artifactStatusEnum = pgEnum("artifact_status", [
  "QUEUED",
  "RUNNING",
  "READY",
  "FAILED",
]);

export const podcastStageEnum = pgEnum("podcast_stage", [
  "SCRIPTING",
  "SYNTHESIZING",
  "MIXING",
  "READY",
]);

export type SourceType = (typeof sourceTypeEnum.enumValues)[number];
export type SourceStatus = (typeof sourceStatusEnum.enumValues)[number];
export type MessageRole = (typeof messageRoleEnum.enumValues)[number];
export type MessageStatus = (typeof messageStatusEnum.enumValues)[number];
export type RoadmapLevel = (typeof roadmapLevelEnum.enumValues)[number];
export type ArtifactStatus = (typeof artifactStatusEnum.enumValues)[number];
export type PodcastStage = (typeof podcastStageEnum.enumValues)[number];
