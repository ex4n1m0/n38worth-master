-- Multi-account detection: new columns on users table
ALTER TABLE "users" ADD COLUMN "multi_account_warnings" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN "multi_account_penalized" integer DEFAULT 0 NOT NULL;

-- IP sessions table: tracks which IPs each user connects from
CREATE TABLE IF NOT EXISTS "ip_sessions" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ip_address" varchar(45) NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_ip_sessions_user_ip" ON "ip_sessions" ("user_id", "ip_address");
CREATE INDEX IF NOT EXISTS "idx_ip_sessions_ip" ON "ip_sessions" ("ip_address");
CREATE INDEX IF NOT EXISTS "idx_ip_sessions_last_seen" ON "ip_sessions" ("last_seen_at");

-- Multi-account incidents table: audit trail of detections
CREATE TABLE IF NOT EXISTS "multi_account_incidents" (
  "id" serial PRIMARY KEY,
  "ip_address" varchar(45) NOT NULL,
  "user_id_1" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "user_id_2" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "action" varchar(20) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_multi_account_ip" ON "multi_account_incidents" ("ip_address");
CREATE INDEX IF NOT EXISTS "idx_multi_account_user1" ON "multi_account_incidents" ("user_id_1");
CREATE INDEX IF NOT EXISTS "idx_multi_account_user2" ON "multi_account_incidents" ("user_id_2");
CREATE INDEX IF NOT EXISTS "idx_multi_account_created" ON "multi_account_incidents" ("created_at");
