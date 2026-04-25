CREATE TABLE "reward_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" double precision NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_onboarding_pool" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reward_history" ADD CONSTRAINT "reward_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reward_history_user" ON "reward_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_reward_history_created" ON "reward_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_reward_history_user_created" ON "reward_history" USING btree ("user_id","created_at");