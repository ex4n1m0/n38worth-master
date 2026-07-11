import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { ensureMassHireCard } from "../src/lib/mass-hire";

/**
 * One-time script to create the "Mass Hire" special NPC card.
 * Safe to re-run (idempotent — uses ensureMassHireCard which checks for existence).
 *
 * Run: npx tsx scripts/seed-mass-hire.ts
 */
async function main() {
  const id = await ensureMassHireCard();
  console.log(`✅ Mass Hire card ensured (id: ${id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
