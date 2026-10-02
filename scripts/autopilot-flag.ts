import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

/**
 * Kill switch for the BYO-AI autopilot (PLAYER_AI_STUDY.md).
 *
 * Usage: npx tsx scripts/autopilot-flag.ts <on|off>   (arg required)
 * npm shortcut: npm run autopilot:flag -- on|off
 *
 * Writes game_settings row "autopilot_enabled" (1 = enabled, 0 = disabled).
 * The public /api/autopilot/enabled route reads it; missing row = OFF.
 *
 * NOTE: dev and production share ONE Neon DB — running this flips the flag
 * everywhere. The on|off argument is REQUIRED so accidental bare
 * invocations can't silently disable the feature.
 */
async function setAutopilotFlag(enabled: boolean) {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);
  const value = enabled ? 1 : 0;

  const [row] = await sql`
    INSERT INTO game_settings (setting_key, setting_value, updated_at)
    VALUES ('autopilot_enabled', ${value}, NOW())
    ON CONFLICT (setting_key) DO UPDATE
      SET setting_value = ${value}, updated_at = NOW()
    RETURNING setting_value
  `;

  console.log(
    `autopilot_enabled = ${row?.setting_value ?? value} (${enabled ? "ON" : "OFF"})`
  );
}

async function main() {
  const arg = process.argv[2];
  if (arg !== "on" && arg !== "off") {
    console.error("Usage: npx tsx scripts/autopilot-flag.ts <on|off>");
    process.exit(1);
  }
  await setAutopilotFlag(arg === "on");
}

main().catch((error) => {
  console.error("Error setting autopilot flag:", error);
  process.exit(1);
});
