import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createOnboardingNpcWithAvatar } from "@/lib/onboarding-npc";

const POOL_SIZE = 3;

/**
 * Cron endpoint: keep the onboarding NPC pool topped up so new players always
 * receive 3 NPCs with avatars when they complete their avatar step.
 */
export async function GET(req: Request) {
  // Verify the request is from Vercel Cron (skip check if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const poolNpcs = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isOnboardingPool, 1));

    const currentSize = poolNpcs.length;

    if (currentSize >= POOL_SIZE) {
      return NextResponse.json({
        ok: true,
        message: "Pool is full",
        currentSize,
        poolSize: POOL_SIZE,
        created: 0,
      });
    }

    const needed = POOL_SIZE - currentSize;
    let created = 0;

    for (let i = 0; i < needed; i++) {
      const id = await createOnboardingNpcWithAvatar(true);
      if (id) created++;
      // Small delay between Unsplash requests to be respectful
      if (i < needed - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return NextResponse.json({
      ok: true,
      previousSize: currentSize,
      poolSize: POOL_SIZE,
      created,
      needed,
    });
  } catch (error) {
    console.error("refill-onboarding-pool cron error:", error);
    return NextResponse.json(
      { error: "Failed to refill onboarding pool" },
      { status: 500 }
    );
  }
}
