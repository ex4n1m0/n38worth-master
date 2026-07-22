import { NextResponse } from "next/server";
import { db } from "@/db";
import { hallOfFame } from "@/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const winners = await db
      .select({
        id: hallOfFame.id,
        userId: hallOfFame.userId,
        username: hallOfFame.username,
        wonAt: hallOfFame.wonAt,
      })
      .from(hallOfFame)
      .orderBy(desc(hallOfFame.wonAt));

    // Public, changes only when someone wins the game — cache at the CDN.
    return NextResponse.json(winners, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch (error) {
    console.error("Hall of Fame fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hall of Fame data" },
      { status: 500 }
    );
  }
}
