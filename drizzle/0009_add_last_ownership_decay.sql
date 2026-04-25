-- Add last_ownership_decay_at to track when idle-user ownership decay last ran per user.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_ownership_decay_at" timestamp;
