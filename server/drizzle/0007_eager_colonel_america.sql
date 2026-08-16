CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider_payment_id" text NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" varchar(8) DEFAULT 'INR' NOT NULL,
	"plan_code" varchar(40) NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_user_paid_at_idx" ON "payments" USING btree ("user_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_payment_idx" ON "payments" USING btree ("provider_payment_id");