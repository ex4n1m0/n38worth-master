import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * One-time (well, one-flag) upsert for the Mainframe City feature flag.
 *
 * Usage: npx tsx scripts/city-flag.ts <on|off>   (arg required)
 * npm shortcut: npm run city:flag -- on|off
 *
 * Writes game_settings row "city_enabled" (1 = enabled, 0 = disabled).
 * The public /api/city/enabled route reads it; missing row = OFF.
 *
 * NOTE: dev and production share ONE Neon DB — running this flips the flag
 * everywhere. The on|off argument is REQUIRED so accidental bare
 * invocations can't silently disable the feature.
 */
async function setCityFlag(enabled: boolean) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);
  const value = enabled ? 1 : 0;

  const [row] = await sql`
    INSERT INTO game_settings (setting_key, setting_value, updated_at)
    VALUES ('city_enabled', ${value}, NOW())
    ON CONFLICT (setting_key) DO UPDATE
      SET setting_value = ${value}, updated_at = NOW()
    RETURNING setting_value
  `;

  console.log(
    `city_enabled = ${row?.setting_value ?? value} (${enabled ? "ON" : "OFF"})`
  );
}

async function main() {
  // No default: a bare "npm run city:flag" must not silently disable the
  // feature on the shared dev+prod DB — force an explicit on|off.
  const arg = process.argv[2];
  if (arg !== "on" && arg !== "off") {
    console.error("Usage: npx tsx scripts/city-flag.ts <on|off>");
    process.exit(1);
  }
  await setCityFlag(arg === "on");
}

main().catch((error) => {
  console.error("Error setting city flag:", error);
  process.exit(1);
});
