-- Add avatar reveal columns to ownership table
ALTER TABLE "ownership" ADD COLUMN IF NOT EXISTS "avatar_reveal_until" timestamp;
