CREATE TABLE "game_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"actor_id" integer,
	"target_id" integer,
	"target_username" varchar(30),
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"recipient_id" integer,
	"content" text NOT NULL,
	"type" text DEFAULT 'public' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"owned_id" integer NOT NULL,
	"purchased_at" timestamp DEFAULT now() NOT NULL,
	"purchase_price" integer NOT NULL,
	"block_sell_until" timestamp,
	"block_sell_by" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"buyer_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(30) NOT NULL,
	"password_hash" text,
	"facebook_id" text,
	"google_id" text,
	"avatar_url" text,
	"player_value" integer DEFAULT 1 NOT NULL,
	"value_floor" integer DEFAULT 1 NOT NULL,
	"credits" real DEFAULT 100 NOT NULL,
	"last_dividend_at" timestamp DEFAULT now() NOT NULL,
	"total_online_minutes" integer DEFAULT 0 NOT NULL,
	"last_online_at" timestamp DEFAULT now() NOT NULL,
	"block_sell_until" timestamp,
	"block_sell_by" varchar(30),
	"estimated_deletion_at" timestamp,
	"is_active" integer DEFAULT 1 NOT NULL,
	"is_verified" integer DEFAULT 0 NOT NULL,
	"is_npc" integer DEFAULT 0 NOT NULL,
	"was_reset" integer DEFAULT 0 NOT NULL,
	"photo_author_name" text,
	"photo_author_url" text,
	"photo_source_url" text,
	"last_rank_bonus_at" timestamp,
	"last_login_reward_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_facebook_id_unique" UNIQUE("facebook_id"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership" ADD CONSTRAINT "ownership_owned_id_users_id_fk" FOREIGN KEY ("owned_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_game_history_created" ON "game_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_game_history_type" ON "game_history" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_game_history_actor" ON "game_history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_messages_type" ON "messages" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_messages_sender" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "idx_messages_recipient" ON "messages" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "idx_messages_created" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_ownership_owner" ON "ownership" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ownership_owned" ON "ownership" USING btree ("owned_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ownership_pair" ON "ownership" USING btree ("owner_id","owned_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_buyer" ON "transactions" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_target" ON "transactions" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_transactions_created" ON "transactions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");