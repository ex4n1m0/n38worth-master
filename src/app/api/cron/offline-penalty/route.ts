import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { sql, lt, gt } from "drizzle-orm";

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
    const now = new Date();
    
    // Find all players who were last online more than 1 hour ago
    // and have more than 1 credit (no need to process those already at minimum)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const inactivePlayers = await db
      .select({
        id: users.id,
        username: users.username,
        credits: users.credits,
        lastOnlineAt: users.lastOnlineAt,
      })
      .from(users)
      .where(
        sql`${users.lastOnlineAt} < ${oneHourAgo} AND ${users.credits} > 1`
      );

    let totalPenalized = 0;
    const penalties: Array<{ username: string; hoursOffline: number; oldCredits: number; newCredits: number }> = [];

    for (const player of inactivePlayers) {
      // Calculate hours offline (round down)
      const hoursOffline = Math.floor(
        (now.getTime() - new Date(player.lastOnlineAt).getTime()) / (1000 * 60 * 60)
      );

      if (hoursOffline < 1) continue;

      // Calculate new credits: reduce by 1% per hour offline
      // Formula: newCredits = oldCredits * (0.99 ^ hoursOffline)
      const decayFactor = Math.pow(0.99, hoursOffline);
      let newCredits = player.credits * decayFactor;
      
      // Round to 2 decimal places
      newCredits = Math.round(newCredits * 100) / 100;
      
      // Never go below 1 credit
      newCredits = Math.max(newCredits, 1);

      // Only update if credits actually changed
      if (newCredits < player.credits) {
        await db
          .update(users)
          .set({
            credits: newCredits,
            updatedAt: now,
          })
          .where(sql`${users.id} = ${player.id}`);

        penalties.push({
          username: player.username,
          hoursOffline,
          oldCredits: Math.round(player.credits * 100) / 100,
          newCredits,
        });
        totalPenalized++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Offline penalty applied: 1% credit decay per hour (minimum 1¢)`,
      totalPenalized,
      penalties,
      timestamp: now.toISOString(),
    });
  } catch (error) {
    console.error("Offline penalty cron error:", error);
    return NextResponse.json(
      { error: "Failed to apply offline penalties" },
      { status: 500 }
    );
  }
}