CREATE TABLE IF NOT EXISTS "game_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"actor_id" integer,
	"target_id" integer,
	"target_username" varchar(30),
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_game_history_created" ON "game_history" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_game_history_type" ON "game_history" USING btree ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_game_history_actor" ON "game_history" USING btree ("actor_id");