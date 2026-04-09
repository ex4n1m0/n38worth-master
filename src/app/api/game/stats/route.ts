import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await db
      .select({
        totalPlayers: sql<number>`COUNT(*)`,
        totalCredits: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN credits ELSE 0 END), 0)`,
        totalValues: sql<number>`COALESCE(SUM(player_value), 0)`,
        totalNpcs: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 1 THEN 1 ELSE 0 END), 0)`,
        totalHumans: sql<number>`COALESCE(SUM(CASE WHEN is_npc = 0 THEN 1 ELSE 0 END), 0)`,
      })
      .from(users);

    const { totalPlayers, totalCredits, totalValues, totalNpcs, totalHumans } = result[0];
    const totalEconomy = Number(totalCredits);

    return NextResponse.json({
      totalPlayers: Number(totalPlayers),
      totalEconomy: Math.round(totalEconomy * 100) / 100,
      totalNpcs: Number(totalNpcs),
      totalHumans: Number(totalHumans),
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
