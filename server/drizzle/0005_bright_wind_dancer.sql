ALTER TABLE "roadmaps" ADD COLUMN "source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "status_stage" text;--> statement-breakpoint
ALTER TABLE "roadmaps" ADD COLUMN "progress" integer DEFAULT 0 NOT NULL;