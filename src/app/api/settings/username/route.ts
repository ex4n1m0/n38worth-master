import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { registerSchema } from "@/lib/validators";

/**
 * POST /api/settings/username — change the current user's username.
 *
 * Currently only enabled for demo players (username starts with "Demo Player_").
 * This is the first half of the demo→permanent conversion: the player must
 * change BOTH their avatar AND their username. When both are done, the
 * `estimatedDeletionAt` field is cleared so the delete-demo-players cron no
 * longer targets this account.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { newUsername } = await req.json();
    if (!newUsername || typeof newUsername !== "string") {
      return NextResponse.json(
        { error: "New username is required" },
        { status: 400 }
      );
    }

    // Reuse the register validator for consistent username rules.
    const parsed = registerSchema
      .pick({ username: true })
      .safeParse({ username: newUsername });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const userId = parseInt(session.user.id);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Only demo players can rename for now.
    if (!user.username.startsWith("Demo Player_")) {
      return NextResponse.json(
        { error: "Username can only be changed for demo accounts" },
        { status: 403 }
      );
    }

    // No-op if the username is unchanged.
    if (user.username === parsed.data.username) {
      return NextResponse.json(
        { error: "That is already your username" },
        { status: 400 }
      );
    }

    // Check uniqueness.
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, parsed.data.username));
    if (existing) {
      return NextResponse.json(
        { error: "Username is already taken" },
        { status: 409 }
      );
    }

    // Update the username.
    await db
      .update(users)
      .set({ username: parsed.data.username, updatedAt: new Date() })
      .where(eq(users.id, userId));

    // Check if the avatar has also been changed from the demo default.
    // Demo players start with "/hidden.png". A custom data: URL means the
    // player has uploaded their own avatar. When BOTH username and avatar are
    // changed, clear the deletion deadline so the account becomes permanent.
    const avatarChanged =
      !!user.avatarUrl &&
      user.avatarUrl !== "/hidden.png" &&
      user.avatarUrl !== "/NEW_HIDDEN.png" &&
      !user.avatarUrl.startsWith("Demo Player");

    let converted = false;
    if (avatarChanged) {
      await db
        .update(users)
        .set({ estimatedDeletionAt: null, updatedAt: new Date() })
        .where(eq(users.id, userId));
      converted = true;
      console.log(
        `Demo player ${user.username} converted to permanent account "${parsed.data.username}" (avatar + username changed)`
      );
    } else {
      console.log(
        `Demo player ${user.username} renamed to "${parsed.data.username}" — avatar still needs to be changed for full conversion`
      );
    }

    return NextResponse.json({
      success: true,
      newUsername: parsed.data.username,
      converted,
      avatarChanged,
    });
  } catch (error) {
    console.error("Username change error:", error);
    return NextResponse.json(
      { error: "Failed to change username" },
      { status: 500 }
    );
  }
}
