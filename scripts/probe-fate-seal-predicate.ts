import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * READ-ONLY probe for the fate-seal cron predicate (H2 finding, 2026-09-27).
 *
 * The cron's step-2 WHERE embeds a raw `... IS NULL OR ... < 2099` inside a
 * Drizzle and(...), which does NOT parenthesize its chunks. SQL precedence
 * turns the intended
 *     owner IN (holders) AND (block IS NULL OR block < 2099) AND not-goddess
 * into
 *     (owner IN (holders) AND block IS NULL) OR (block < 2099 AND not-goddess)
 * so ANY non-goddess ownership row with an active timed firewall (any owner)
 * gets selected, stamped as a Fate seal (2099), and then nulled by step 3.
 *
 * This script ONLY SELECTs: it reports how many rows each predicate matches
 * with the CURRENT fate-holder set, plus how many active foreign firewalls
 * would be wrongly matched. It never writes.
 *
 * Usage: npx tsx scripts/probe-fate-seal-predicate.ts
 */
const FATE_SEAL_DATE = "2099-12-31 23:59:59+00";
const GODDESS_USERNAMES = [
  "Goddess",
  "Goddess of Fate",
  "Goddess of Knowledge",
  "Goddess of Time",
  "Goddess of War",
  "Goddess of Wealth",
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  const sql = neon(process.env.DATABASE_URL);

  // Mirror the cron's step 1 exactly (goddess-powers.ts convention):
  // hasFate = (owns "Goddess" with all-powers not toggled off) OR
  //           (owns "Goddess of Fate" with Fate not toggled off).
  // Toggles are a bitmask in game_settings "goddess_powers_off_<userId>"
  // (Fate = 1<<2 = 4, "Goddess" all-powers = 1<<5 = 32).
  const FATE_BIT = 4;
  const ALL_BIT = 32;
  const candidateRows = await sql`
    SELECT o.owner_id AS owner_id, u.username AS username
    FROM ownership o
    JOIN users u ON u.id = o.owned_id
    WHERE u.username IN ('Goddess of Fate', 'Goddess')
  `;
  const ownedByOwner = new Map<number, Set<string>>();
  for (const r of candidateRows) {
    if (!ownedByOwner.has(r.owner_id)) ownedByOwner.set(r.owner_id, new Set());
    ownedByOwner.get(r.owner_id)!.add(r.username);
  }
  const holderIds: number[] = [];
  for (const [ownerId, owned] of ownedByOwner) {
    const maskRows = await sql`
      SELECT setting_value FROM game_settings
      WHERE setting_key = ${"goddess_powers_off_" + ownerId}
    `;
    const mask = maskRows.length ? Number(maskRows[0].setting_value) : 0;
    const effectiveHasAll = owned.has("Goddess") && (mask & ALL_BIT) === 0;
    const hasFate = (effectiveHasAll || owned.has("Goddess of Fate")) && (mask & FATE_BIT) === 0;
    if (hasFate) holderIds.push(ownerId);
  }
  console.log(`Fate holders with power ON: ${holderIds.length} ${JSON.stringify(holderIds)}`);

  if (holderIds.length === 0) {
    console.log("No active Fate holders — the broken predicate currently matches nothing (bug dormant).");
  }

  // EXACTLY the broken predicate as drizzle renders it (bare AND/OR, no parens).
  const broken = holderIds.length
    ? await sql`
        SELECT count(*)::int AS n, count(DISTINCT o.owner_id)::int AS owners
        FROM ownership o JOIN users u ON u.id = o.owned_id
        WHERE o.owner_id = ANY(${holderIds}) AND o.block_sell_until IS NULL OR o.block_sell_until < ${FATE_SEAL_DATE} AND u.username != ALL(${GODDESS_USERNAMES})
      `
    : [{ n: 0, owners: 0 }];

  // The intended predicate (parenthesized OR).
  const fixed = holderIds.length
    ? await sql`
        SELECT count(*)::int AS n, count(DISTINCT o.owner_id)::int AS owners
        FROM ownership o JOIN users u ON u.id = o.owned_id
        WHERE o.owner_id = ANY(${holderIds}) AND (o.block_sell_until IS NULL OR o.block_sell_until < ${FATE_SEAL_DATE}) AND u.username != ALL(${GODDESS_USERNAMES})
      `
    : [{ n: 0, owners: 0 }];

  // The collateral: foreign rows (owner NOT a holder) with an active timed
  // firewall — these are what the broken predicate wrongly selects. With no
  // holders, every active firewall is foreign.
  const collateral = holderIds.length
    ? await sql`
        SELECT count(*)::int AS n, count(DISTINCT o.owner_id)::int AS owners
        FROM ownership o JOIN users u ON u.id = o.owned_id
        WHERE NOT (o.owner_id = ANY(${holderIds})) AND o.block_sell_until IS NOT NULL AND o.block_sell_until < ${FATE_SEAL_DATE} AND u.username != ALL(${GODDESS_USERNAMES})
      `
    : await sql`
        SELECT count(*)::int AS n, count(DISTINCT o.owner_id)::int AS owners
        FROM ownership o JOIN users u ON u.id = o.owned_id
        WHERE o.block_sell_until IS NOT NULL AND o.block_sell_until < ${FATE_SEAL_DATE} AND u.username != ALL(${GODDESS_USERNAMES})
      `;

  // Also show currently-installed fate seals for context (step-3 fuel).
  const seals = await sql`
    SELECT count(*)::int AS n, count(DISTINCT owner_id)::int AS owners
    FROM ownership
    WHERE block_sell_by = 'Goddess of Fate' AND block_sell_until = ${FATE_SEAL_DATE}
  `;

  console.log(`Broken predicate matches:  ${broken[0].n} rows across ${broken[0].owners} owners`);
  console.log(`Fixed predicate matches:   ${fixed[0].n} rows across ${fixed[0].owners} owners`);
  console.log(`Collateral (foreign active firewalls wrongly matched): ${collateral[0].n} rows across ${collateral[0].owners} owners`);
  console.log(`Existing Fate-sealed rows (blockSellBy='Goddess of Fate' @2099): ${seals[0].n} across ${seals[0].owners} owners`);
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
