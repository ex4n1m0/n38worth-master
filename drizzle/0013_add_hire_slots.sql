-- Add hire_slots column to users table
-- Default 20 for new players; existing players get GREATEST(20, ceil(owned_count/10)*10)
ALTER TABLE users ADD COLUMN IF NOT EXISTS hire_slots INTEGER NOT NULL DEFAULT 20;

-- Seed existing players: cover their current owned count, rounded up to nearest 10 (min 20)
UPDATE users u
SET hire_slots = GREATEST(
  20,
  CEIL((
    SELECT COUNT(*) FROM ownership o WHERE o.owner_id = u.id
  )::numeric / 10.0) * 10
);
