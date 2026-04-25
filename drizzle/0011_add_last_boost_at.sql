-- Per-ownership cooldown for the Boost button (60s).
-- Stores the last time this ownership row was used to boost the owned card.
ALTER TABLE "ownership" ADD COLUMN IF NOT EXISTS "last_boost_at" timestamp;
