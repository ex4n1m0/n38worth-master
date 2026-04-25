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

    return NextResponse.json(winners);
  } catch (error) {
    console.error("Hall of Fame fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hall of Fame data" },
      { status: 500 }
    );
  }
}
