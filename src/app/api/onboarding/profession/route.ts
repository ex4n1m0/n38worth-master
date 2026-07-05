import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PROFESSIONS } from "@/lib/professions";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    const body = await request.json();
    const { profession } = body;

    if (!profession || typeof profession !== "string") {
      return NextResponse.json(
        { error: "Profession name is required" },
        { status: 400 }
      );
    }

    // Validate that the profession is one of the 6 valid professions
    const validProfession = PROFESSIONS.find((p) => p.name === profession);
    if (!validProfession) {
      return NextResponse.json(
        { error: `Invalid profession. Must be one of: ${PROFESSIONS.map((p) => p.name).join(", ")}` },
        { status: 400 }
      );
    }

    const [updatedUser] = await db
      .update(users)
      .set({ profession, onboardingComplete: 1, onboardingStarted: 1 })
      .where(eq(users.id, userId))
      .returning({ id: users.id, profession: users.profession });

    if (!updatedUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    console.log(`User ${userId} chose profession: ${profession}`);

    return NextResponse.json({
      success: true,
      profession: updatedUser.profession,
    });
  } catch (error) {
    console.error("Profession update error:", error);
    return NextResponse.json(
      { error: "Failed to update profession" },
      { status: 500 }
    );
  }
}