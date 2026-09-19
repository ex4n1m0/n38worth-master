-- Step-by-step tutorial overlay state on users:
--   0 = will show on next login, 1 = finished, 2 = cancelled early.
-- Reset ("Replay tutorial") from the Settings page.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tutorial_completed" integer DEFAULT 0 NOT NULL;
