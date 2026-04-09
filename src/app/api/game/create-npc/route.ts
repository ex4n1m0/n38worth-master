import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, transactions, ownership } from "@/db/schema";
import { eq, count } from "drizzle-orm";
import { createRandomPlayer } from "@/lib/random-player";

const NPC_CREATION_COST = 100; // Fixed price of $100
const MIN_OWNED_PLAYERS = 55; // Must own at least 55 players to unlock NPC creation

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.name) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current user
    const [currentUser] = await db
      .select({ id: users.id, credits: users.credits })
      .from(users)
      .where(eq(users.username, session.user.name))
      .limit(1);

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has enough credits
    if (currentUser.credits < NPC_CREATION_COST) {
      return NextResponse.json(
        { error: `Insufficient credits. You need ${NPC_CREATION_COST}¢ to create an NPC.` },
        { status: 400 }
      );
    }

    // Check if user owns enough players to unlock NPC creation
    const [ownedCount] = await db
      .select({ count: count() })
      .from(ownership)
      .where(eq(ownership.ownerId, currentUser.id));

    if ((ownedCount?.count ?? 0) < MIN_OWNED_PLAYERS) {
      return NextResponse.json(
        { error: `You must own at least ${MIN_OWNED_PLAYERS} players to create NPCs. You currently own ${ownedCount?.count ?? 0}.` },
        { status: 400 }
      );
    }

    // Parse optional custom query from request body
    let customQuery: string | undefined;
    try {
      const body = await req.json();
      if (body?.customQuery && typeof body.customQuery === "string") {
        customQuery = body.customQuery;
      }
    } catch {
      // No body or invalid JSON — use default random query
    }

    // Deduct credits from user
    await db
      .update(users)
      .set({ credits: currentUser.credits - NPC_CREATION_COST })
      .where(eq(users.id, currentUser.id));

    // Create the random NPC player (with optional custom query)
    const result = await createRandomPlayer(customQuery);

    if (!result.success) {
      // Refund credits if NPC creation failed
      await db
        .update(users)
        .set({ credits: currentUser.credits })
        .where(eq(users.id, currentUser.id));

      return NextResponse.json(
        { error: result.message || "Failed to create NPC" },
        { status: 500 }
      );
    }

    // Record the transaction
    await db.insert(transactions).values({
      buyerId: currentUser.id,
      targetId: result.player?.id || 0,
      type: "create_npc",
      amount: NPC_CREATION_COST,
    });

    return NextResponse.json({
      success: true,
      message: `NPC "${result.player?.username}" created successfully!`,
      npc: result.player,
      cost: NPC_CREATION_COST,
    });
  } catch (error) {
    console.error("Create NPC error:", error);
    return NextResponse.json(
      { error: "Failed to create NPC" },
      { status: 500 }
    );
  }
}