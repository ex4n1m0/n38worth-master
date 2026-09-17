-- Self-hosted acquisition analytics: landing-page visits + signup attribution
-- from UTM cookies (see src/lib/analytics.ts). Apply with npm run db:push
-- (or run this file directly against Neon).
CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(16) NOT NULL,
	"path" varchar(128),
	"referrer_domain" varchar(128),
	"utm_source" varchar(64),
	"utm_medium" varchar(64),
	"utm_campaign" varchar(64),
	"username" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "analytics_events_created_at_idx" ON "analytics_events" USING btree ("created_at");
CREATE INDEX IF NOT EXISTS "analytics_events_type_idx" ON "analytics_events" USING btree ("type");
