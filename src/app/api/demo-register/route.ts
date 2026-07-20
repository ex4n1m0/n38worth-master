import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, gameSettings } from "@/db/schema";
import { sql, eq } from "drizzle-orm";

// Persistent, ever-incrementing counter for demo player names. Stored in
// game_settings so the number keeps climbing forever — even after old demo
// accounts are purged — instead of being reused.
const DEMO_COUNTER_KEY = "demo_player_counter";

export async function POST() {
  try {
    // Seed the counter (only the very first time) from the highest existing
    // demo number so numbering continues from where we are today and never
    // jumps backwards. Once seeded, this insert is a no-op.
    const existingDemos = await db
      .select({ username: users.username })
      .from(users)
      .where(sql`${users.username} LIKE 'Demo Player_%'`);

    let maxNum = 0;
    for (const d of existingDemos) {
      const match = d.username.match(/^Demo Player_(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }

    await db
      .insert(gameSettings)
      .values({ settingKey: DEMO_COUNTER_KEY, settingValue: maxNum })
      .onConflictDoNothing({ target: gameSettings.settingKey });

    // Atomically bump the persistent counter and use the new value. If a name
    // is somehow still taken (e.g. a live demo created before this counter
    // existed), keep bumping until we land on a free one.
    const nextDemoNumber = async (): Promise<number> => {
      const [row] = await db
        .update(gameSettings)
        .set({
          settingValue: sql`${gameSettings.settingValue} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(gameSettings.settingKey, DEMO_COUNTER_KEY))
        .returning({ value: gameSettings.settingValue });
      return row.value;
    };

    let username = "";
    for (let attempts = 0; attempts < 50 && !username; attempts++) {
      const candidate = `Demo Player_${await nextDemoNumber()}`;
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, candidate));
      if (!taken) username = candidate;
    }

    if (!username) {
      return NextResponse.json(
        { error: "Could not allocate a demo player name" },
        { status: 500 }
      );
    }

    const now = new Date();
    const deletionAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour

    // Create demo user with onboarding already complete.
    const [newUser] = await db
      .insert(users)
      .values({
        username,
        passwordHash: null,
        avatarUrl: "/NEW_HIDDEN.webp",
        credits: 100,
        playerValue: 1,
        valueFloor: 1,
        isActive: 1,
        isVerified: 0,
        isNpc: 0,
        avatarCompleted: 1,
        onboardingComplete: 1,
        onboardingNpcs: [],
        onboardingOwnedCount: 0,
        onboardingStarted: 1,
        estimatedDeletionAt: deletionAt,
        createdAt: now,
        updatedAt: now,
        lastOnlineAt: now,
        lastDividendAt: now,
      })
      .returning({ id: users.id, username: users.username });

    return NextResponse.json(
      { id: newUser.id, username: newUser.username, password: "demo" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Demo registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
