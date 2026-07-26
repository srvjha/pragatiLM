ALTER TABLE "citations" ADD COLUMN "source_title" varchar(300) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "citations" ADD COLUMN "source_type" varchar(16) DEFAULT '' NOT NULL;