import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/multi-account/status
 * Returns the current user's multi-account warning/penalty status.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  const [user] = await db
    .select({
      warnings: users.multiAccountWarnings,
      penalized: users.multiAccountPenalized,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    warnings: user.warnings,
    penalized: !!user.penalized,
  });
}
