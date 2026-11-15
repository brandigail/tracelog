CREATE TYPE "public"."severity" AS ENUM('INFO', 'WARN', 'ERROR');--> statement-breakpoint
CREATE TABLE "alert_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"severity" "severity" NOT NULL,
	"threshold" integer NOT NULL,
	"window_sec" integer NOT NULL,
	"webhook_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" uuid NOT NULL,
	"severity" "severity" NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "logs" ADD CONSTRAINT "logs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alert_rules_source_idx" ON "alert_rules" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "logs_source_ts_idx" ON "logs" USING btree ("source_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_severity_ts_idx" ON "logs" USING btree ("severity","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_source_id_idx" ON "logs" USING btree ("source_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "logs_ts_idx" ON "logs" USING btree ("ts" DESC NULLS LAST);