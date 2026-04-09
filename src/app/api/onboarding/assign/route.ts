import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, lt, and, sql, desc, notInArray } from "drizzle-orm";

// Onboarding NPC adjectives and nouns for generating unique names
const ONBOARDING_ADJECTIVES = [
  "Fresh", "New", "Starter", "Beginner", "Rookie", "Novice", "Basic", "Simple",
  "Quick", "Swift", "Bright", "Smart", "Wise", "Bold", "Brave", "Kind",
  "Happy", "Lucky", "Sunny", "Golden", "Silver", "Crystal", "Diamond", "Star"
];

const ONBOARDING_NOUNS = [
  "Player", "Trader", "Investor", "Merchant", "Dealer", "Broker", "Agent", "Runner",
  "Hunter", "Gatherer", "Collector", "Keeper", "Guardian", "Watcher", "Seeker", "Finder",
  "Dreamer", "Thinker", "Worker", "Builder", "Maker", "Creator", "Explorer", "Pioneer"
];

function generateOnboardingNpcName(): string {
  const adj = ONBOARDING_ADJECTIVES[Math.floor(Math.random() * ONBOARDING_ADJECTIVES.length)];
  const noun = ONBOARDING_NOUNS[Math.floor(Math.random() * ONBOARDING_NOUNS.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  return `${adj}${noun}${num}`;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = parseInt(session.user.id);

  try {
    // Check if already assigned
    const [user] = await db
      .select({
        onboardingNpcs: users.onboardingNpcs,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existingNpcs = (user.onboardingNpcs as number[]) || [];
    if (existingNpcs.length > 0) {
      return NextResponse.json({ npcIds: existingNpcs, alreadyAssigned: true });
    }

    // Create 3 fresh NPCs specifically for onboarding with $1 cost
    const npcIds: number[] = [];
    
    for (let i = 0; i < 3; i++) {
      const npcName = generateOnboardingNpcName();
      
      const [newNpc] = await db
        .insert(users)
        .values({
          username: npcName,
          isNpc: 1,
          playerValue: 1, // $1 cost for onboarding NPCs
          credits: 0,
          isActive: 1,
        })
        .returning({ id: users.id });
      
      npcIds.push(newNpc.id);
    }

    // Store the NPC IDs in the user's onboarding state
    await db
      .update(users)
      .set({
        onboardingNpcs: npcIds,
      })
      .where(eq(users.id, userId));

    return NextResponse.json({
      npcIds,
      assigned: true,
      message: "Created 3 fresh starter NPCs for onboarding!",
    });
  } catch (error) {
    console.error("NPC assignment error:", error);
    return NextResponse.json(
      { error: "Failed to assign onboarding NPCs" },
      { status: 500 }
    );
  }
}