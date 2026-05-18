CREATE TABLE "avatar_reveals" (
	"id" serial PRIMARY KEY NOT NULL,
	"viewer_id" integer NOT NULL,
	"target_id" integer NOT NULL,
	"reveal_until" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ownership" ADD COLUMN "avatar_reveal_until" timestamp;--> statement-breakpoint
ALTER TABLE "ownership" ADD COLUMN "boost_press_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ownership" ADD COLUMN "last_boost_press_at" timestamp;--> statement-breakpoint
ALTER TABLE "ownership" ADD COLUMN "reveal_press_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "ownership" ADD COLUMN "last_reveal_press_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "hire_slots" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "avatar_reveals" ADD CONSTRAINT "avatar_reveals_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatar_reveals" ADD CONSTRAINT "avatar_reveals_target_id_users_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_avatar_reveals_viewer" ON "avatar_reveals" USING btree ("viewer_id");--> statement-breakpoint
CREATE INDEX "idx_avatar_reveals_target" ON "avatar_reveals" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_avatar_reveals_pair" ON "avatar_reveals" USING btree ("viewer_id","target_id");