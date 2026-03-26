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
        totalCredits: sql<number>`COALESCE(SUM(credits), 0)`,
        totalValues: sql<number>`COALESCE(SUM(player_value), 0)`,
      })
      .from(users);

    const { totalPlayers, totalCredits, totalValues } = result[0];
    const totalEconomy = Number(totalValues);

    return NextResponse.json({
      totalPlayers: Number(totalPlayers),
      totalEconomy: Math.round(totalEconomy * 100) / 100,
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}