import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Step-by-step tutorial overlay actions. The state lives on
 * users.tutorial_completed: 0 = show on next login, 1 = finished,
 * 2 = cancelled early. Current value is served via GET /api/onboarding.
 */
const ACTIONS: Record<string, number> = {
  complete: 1,
  cancel: 2,
  reset: 0,
};

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action } = await req.json();
    const value = ACTIONS[action];
    if (value === undefined) {
      return NextResponse.json(
        { error: "Unknown action — expected complete, cancel or reset" },
        { status: 400 }
      );
    }

    await db
      .update(users)
      .set({ tutorialCompleted: value, updatedAt: new Date() })
      .where(eq(users.id, parseInt(session.user.id)));

    return NextResponse.json({ success: true, tutorialCompleted: value });
  } catch (error) {
    console.error("Tutorial action error:", error);
    return NextResponse.json(
      { error: "Failed to update tutorial state" },
      { status: 500 }
    );
  }
}
