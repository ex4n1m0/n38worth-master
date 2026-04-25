-- Partial unique index on users.photo_source_url to hard-guard against
-- duplicate NPCs sharing the same Unsplash photo. The SELECT-then-INSERT
-- duplicate check in src/lib/random-player.ts is racy (two concurrent
-- cron invocations can both pass the check before either inserts). A
-- unique index lets us rely on ON CONFLICT to detect duplicates atomically.
--
-- Partial (WHERE photo_source_url IS NOT NULL) so it doesn't conflict
-- with humans and non-Unsplash NPCs where the column is null.
CREATE UNIQUE INDEX IF NOT EXISTS "idx_users_photo_source_url_unique"
  ON "users" ("photo_source_url")
  WHERE "photo_source_url" IS NOT NULL;
