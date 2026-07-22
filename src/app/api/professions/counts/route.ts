import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isNotNull, sql } from "drizzle-orm";

// Returns the current number of players (humans + NPCs) for each profession.
export async function GET() {
  try {
    const rows = await db
      .select({
        profession: users.profession,
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(isNotNull(users.profession))
      .groupBy(users.profession);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.profession) {
        counts[row.profession] = Number(row.count);
      }
    }

    // Public aggregate counts — cache at the CDN.
    return NextResponse.json({ counts }, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600" },
    });
  } catch (error) {
    console.error("Profession counts error:", error);
    return NextResponse.json(
      { error: "Failed to load profession counts" },
      { status: 500 }
    );
  }
}
