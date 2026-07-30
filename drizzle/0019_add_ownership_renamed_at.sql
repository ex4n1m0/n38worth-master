-- Allow each owner of an NPC card to rename it once.
-- Stamped on rename; a new ownership row (new owner) starts NULL again.
ALTER TABLE ownership ADD COLUMN IF NOT EXISTS renamed_at timestamp;
