import { NextResponse } from "next/server";
import { db } from "@/db";
import { gameSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Mainframe City — public feature-flag read (game_settings "city_enabled").
 *
 * PUBLIC/CDN-SAFE BY CONSTRUCTION: this route NEVER calls auth() and returns
 * the same viewer-independent boolean for everyone, so it is safe to cache on
 * the CDN (AGENTS.md CDN conventions). Missing row or DB error = OFF (fail
 * closed) — the /city page and navbar entry stay hidden until the flag is
 * explicitly turned on via `npm run city:flag on`.
 */
// Same uncached-handler declaration as the other DB-backed public routes
// (ranks, landing-data) — explicit rather than relying on framework defaults.
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = {
    "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  };

  try {
    const [row] = await db
      .select({ value: gameSettings.settingValue })
      .from(gameSettings)
      .where(eq(gameSettings.settingKey, "city_enabled"))
      .limit(1);

    return NextResponse.json(
      { enabled: row ? Number(row.value) === 1 : false },
      { headers }
    );
  } catch (error) {
    console.error("City flag error:", error);
    // Fail closed, but keep the short cache so an outage can't hammer the DB.
    return NextResponse.json({ enabled: false }, { headers });
  }
}
