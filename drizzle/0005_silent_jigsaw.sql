ALTER TABLE "ownership" ADD COLUMN "last_boost_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_started" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_ownership_decay_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_create_npc_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_photo_source_url_unique" ON "users" USING btree ("photo_source_url") WHERE "users"."photo_source_url" IS NOT NULL;