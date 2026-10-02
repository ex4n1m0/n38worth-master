import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Autopilot — public feature-flag read (game_settings "autopilot_enabled").
 *
 * PUBLIC/CDN-SAFE BY CONSTRUCTION: never calls auth(), same boolean for
 * every viewer (city:flag pattern). Missing row or DB error = OFF (fail
 * closed) — the Settings card and navbar chip stay hidden until the flag
 * is turned on via `npm run autopilot:flag -- on`.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };

  try {
    const [row] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, "autopilot_enabled"))
      .limit(1);

    return NextResponse.json(
      { enabled: row ? Number(row.value) === 1 : false },
      { headers }
    );
  } catch (error) {
    console.error("Autopilot flag error:", error);
    return NextResponse.json({ enabled: false }, { headers });
  }
}
