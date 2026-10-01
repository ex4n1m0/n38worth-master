import { NextResponse } from "next/server";
import { getVaultStatus, maybeProcessBreak } from "@/lib/world-vault";

/**
 * Public World Vault status. no-store (breaks are processed lazily HERE —
 * a CDN-cached response would hide them for a minute), plus the hourly
 * leaderboard-prizes cron as the backstop processor. maxDuration 60s: a
 * big break's payout loop must fit one invocation.
 */
export const maxDuration = 60;
export async function GET() {
  try {
    await maybeProcessBreak();
    const status = await getVaultStatus();
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("World vault status error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
