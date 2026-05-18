import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.isNpc, 0), eq(users.isActive, 1)));

    return NextResponse.json({ count: result?.count ?? 0 });
  } catch (error) {
    console.error("Human count error:", error);
    return NextResponse.json({ count: 0 });
  }
}
