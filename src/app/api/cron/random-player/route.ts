import { NextResponse } from "next/server";
import { createRandomPlayer, cleanupUnownedNpcs, cleanupInactiveNpcs } from "@/lib/random-player";

export async function GET(req: Request) {
  // Verify the request is from Vercel Cron (skip if CRON_SECRET not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Create a new random player
    const result = await createRandomPlayer();

    // Clean up NPC players without owners older than 1 day
    const cleanup = await cleanupUnownedNpcs();

    // Clean up NPC players offline 3+ days with $1 credit and $1 value
    const inactiveCleanup = await cleanupInactiveNpcs();

    return NextResponse.json({
      ...result,
      cleanup,
      inactiveCleanup,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Random player cron error:", error);
    return NextResponse.json(
      { error: "Failed to create random player" },
      { status: 500 }
    );
  }
}
