import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function createGameSettingsTable() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  const sql = neon(process.env.DATABASE_URL);

  try {
    // Create game_settings table
    await sql`
      CREATE TABLE IF NOT EXISTS game_settings (
        id SERIAL PRIMARY KEY,
        setting_key VARCHAR(50) NOT NULL UNIQUE,
        setting_value INTEGER NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    console.log("✅ game_settings table created successfully");

    // Initialize ownership limit based on current player count
    const [result] = await sql`
      INSERT INTO game_settings (setting_key, setting_value, updated_at)
      SELECT 'max_ownership_limit', GREATEST(1, FLOOR(COUNT(*) * 0.1)), NOW()
      FROM users
      ON CONFLICT (setting_key) DO NOTHING
      RETURNING setting_value
    `;

    if (result) {
      console.log(`✅ Initialized ownership limit to ${result.setting_value}`);
    } else {
      console.log("ℹ️  Ownership limit already exists");
    }
  } catch (error) {
    console.error("Error creating game_settings table:", error);
    process.exit(1);
  }
}

createGameSettingsTable();