import { NextResponse } from "next/server";

/**
 * Ownership limit cron — DEPRECATED.
 *
 * The per-player ownership cap is now a static 500 (see `purchasePlayer.ts`
 * and `/api/settings/ownership-limit`). This endpoint is kept as a no-op so
 * the existing Vercel cron schedule keeps returning 200 OK without touching
 * the database.
 */
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.json({
    success: true,
    deprecated: true,
    limit: 500,
    message:
      "Ownership limit is now a static 500 — this cron is a no-op.",
    timestamp: new Date().toISOString(),
  });
}
