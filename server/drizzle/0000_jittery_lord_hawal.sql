CREATE TYPE "public"."artifact_status" AS ENUM('QUEUED', 'RUNNING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('streaming', 'complete', 'stopped', 'error');--> statement-breakpoint
CREATE TYPE "public"."podcast_stage" AS ENUM('SCRIPTING', 'SYNTHESIZING', 'MIXING', 'READY');--> statement-breakpoint
CREATE TYPE "public"."roadmap_level" AS ENUM('new', 'some', 'experienced');--> statement-breakpoint
CREATE TYPE "public"."source_status" AS ENUM('QUEUED', 'UPLOADING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('PDF', 'TEXT', 'WEB', 'YOUTUBE', 'VTT');--> statement-breakpoint
CREATE TABLE "notebooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"type" "source_type" NOT NULL,
	"title" text NOT NULL,
	"status" "source_status" DEFAULT 'QUEUED' NOT NULL,
	"status_stage" text,
	"progress" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"selected" boolean DEFAULT true NOT NULL,
	"original_url" text,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"indexed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"notebook_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"text" text NOT NULL,
	"token_count" integer NOT NULL,
	"locator" jsonb NOT NULL,
	"embedding_model" text NOT NULL,
	"embedding_dim" integer NOT NULL,
	"vector_id" uuid,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "chunks"."text")) STORED
);
--> statement-breakpoint
CREATE TABLE "retrieval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"original_query" text NOT NULL,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"routing" jsonb,
	"rounds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_chunk_ids" uuid[] DEFAULT '{}' NOT NULL,
	"context_grade" real,
	"answer_grade" real,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"timings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"source_id" uuid,
	"chunk_id" uuid,
	"snippet" text NOT NULL,
	"locator" jsonb NOT NULL,
	"score" integer,
	"marker_index" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"status" "message_status" DEFAULT 'complete' NOT NULL,
	"retrieval_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_audio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"podcast_id" uuid NOT NULL,
	"mime_type" text DEFAULT 'audio/mpeg' NOT NULL,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"title" text NOT NULL,
	"script" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration_sec" integer,
	"status" "artifact_status" DEFAULT 'QUEUED' NOT NULL,
	"stage" "podcast_stage",
	"progress" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roadmaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"level" "roadmap_level" NOT NULL,
	"goal" text,
	"modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "artifact_status" DEFAULT 'QUEUED' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_runs" ADD CONSTRAINT "retrieval_runs_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_chunk_id_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."chunks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_retrieval_run_id_retrieval_runs_id_fk" FOREIGN KEY ("retrieval_run_id") REFERENCES "public"."retrieval_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_audio" ADD CONSTRAINT "podcast_audio_podcast_id_podcasts_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."podcasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcasts" ADD CONSTRAINT "podcasts_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notebooks_user_id_idx" ON "notebooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sources_notebook_id_idx" ON "sources" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_notebook_content_hash_key" ON "sources" USING btree ("notebook_id","content_hash");--> statement-breakpoint
CREATE INDEX "source_files_source_id_kind_idx" ON "source_files" USING btree ("source_id","kind");--> statement-breakpoint
CREATE INDEX "chunks_source_id_idx" ON "chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "chunks_notebook_id_idx" ON "chunks" USING btree ("notebook_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chunks_source_chunk_index_key" ON "chunks" USING btree ("source_id","chunk_index");--> statement-breakpoint
CREATE INDEX "chunks_tsv_idx" ON "chunks" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "retrieval_runs_notebook_id_idx" ON "retrieval_runs" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "retrieval_runs_created_at_idx" ON "retrieval_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "chats_notebook_id_idx" ON "chats" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "citations_message_id_idx" ON "citations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "citations_source_id_idx" ON "citations" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "messages_chat_id_idx" ON "messages" USING btree ("chat_id");--> statement-breakpoint
CREATE INDEX "podcasts_notebook_id_idx" ON "podcasts" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "roadmaps_notebook_id_idx" ON "roadmaps" USING btree ("notebook_id");