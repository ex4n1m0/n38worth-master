import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getGoddessPowers } from "@/lib/goddess-powers";

const MASS_HIRE_FEE = 1000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const [user] = await db
      .select({ credits: users.credits })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const powers = await getGoddessPowers(userId);
    if (powers.hasFate) {
      return NextResponse.json({ ok: true, deducted: 0 });
    }

    if (user.credits < MASS_HIRE_FEE) {
      return NextResponse.json(
        { error: `Mass Hire costs ${MASS_HIRE_FEE}¢. You don't have enough credits.` },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ credits: sql`GREATEST(credits - ${MASS_HIRE_FEE}, 0)` })
      .where(eq(users.id, userId));

    return NextResponse.json({ ok: true, deducted: MASS_HIRE_FEE });
  } catch (error) {
    console.error("Mass hire fee error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
