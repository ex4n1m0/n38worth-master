CREATE TABLE "game_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting_key" varchar(50) NOT NULL,
	"setting_value" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "game_settings_setting_key_unique" UNIQUE("setting_key")
);
--> statement-breakpoint
CREATE TABLE "hall_of_fame" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"username" varchar(30) NOT NULL,
	"won_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ip_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "multi_account_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_id_1" integer NOT NULL,
	"user_id_2" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ownership" ALTER COLUMN "purchase_price" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "amount" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "player_value" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "player_value" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "value_floor" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "value_floor" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "credits" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "credits" SET DEFAULT 100;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "ownerless_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "multi_account_warnings" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "multi_account_penalized" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_completed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_npcs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_owned_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarding_complete" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_protected" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ip_sessions" ADD CONSTRAINT "ip_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_account_incidents" ADD CONSTRAINT "multi_account_incidents_user_id_1_users_id_fk" FOREIGN KEY ("user_id_1") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "multi_account_incidents" ADD CONSTRAINT "multi_account_incidents_user_id_2_users_id_fk" FOREIGN KEY ("user_id_2") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_ip_sessions_user_ip" ON "ip_sessions" USING btree ("user_id","ip_address");--> statement-breakpoint
CREATE INDEX "idx_ip_sessions_ip" ON "ip_sessions" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_ip_sessions_last_seen" ON "ip_sessions" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "idx_multi_account_ip" ON "multi_account_incidents" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_multi_account_user1" ON "multi_account_incidents" USING btree ("user_id_1");--> statement-breakpoint
CREATE INDEX "idx_multi_account_user2" ON "multi_account_incidents" USING btree ("user_id_2");--> statement-breakpoint
CREATE INDEX "idx_multi_account_created" ON "multi_account_incidents" USING btree ("created_at");