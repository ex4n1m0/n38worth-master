CREATE TABLE IF NOT EXISTS "reward_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "type" text NOT NULL,
  "amount" double precision NOT NULL,
  "details" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_reward_history_user" ON "reward_history" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_reward_history_created" ON "reward_history" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_reward_history_user_created" ON "reward_history" ("user_id", "created_at");
