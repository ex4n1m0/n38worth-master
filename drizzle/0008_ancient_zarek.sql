DROP INDEX "idx_users_onboarding_created_by";--> statement-breakpoint
ALTER TABLE "ownership" ADD COLUMN "block_unbreakable_until" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profession" varchar(30);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "temporary_knowledge_until" timestamp;