/**
 * One-shot backfill: seed each HUMAN player's `photo_score` (their card "Score")
 * from their existing `purchase_count`.
 *
 * For humans, photo_score now represents "times purchased or pumped". NPCs keep
 * their Unsplash-likes score, so this only touches is_npc = 0 players. Pumps
 * weren't tracked historically, so we start from the lifetime purchase count.
 * Only rows where photo_score is still below purchase_count are updated, so it
 * won't clobber scores that have already started accumulating.
 *
 * Run: npx tsx scripts/backfill-human-scores.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  const updated = (await sql`
    UPDATE users
    SET photo_score = purchase_count, updated_at = NOW()
    WHERE is_npc = 0 AND photo_score < purchase_count
    RETURNING id;
  `) as Array<{ id: number }>;

  console.log(`Backfilled human scores for ${updated.length} player(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
