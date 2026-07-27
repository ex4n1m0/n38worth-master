import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { sql, eq, inArray, and, isNotNull, notInArray } from "drizzle-orm";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // ── 1. Fetch ALL players once (NO avatarUrl — base64 causes OOM on Neon) ──
    // Include the 6 goddesses (isNpc=1 but autonomous AI players) alongside
    // humans (isNpc=0). Exclude the removed support Agent. All must have a
    // completed avatar to be visible.
    const allPlayers = await db
      .select({
        id: users.id,
        username: users.username,
        playerValue: users.playerValue,
        createdAt: users.createdAt,
        lastOnlineAt: users.lastOnlineAt,
        credits: users.credits,
        purchaseCount: users.purchaseCount,
      })
      .from(users)
      .where(and(
        sql`${users.isNpc} = 0 OR ${users.username} IN (${sql.join(GODDESS_USERNAMES.map((u) => sql`${u}`), sql`, `)})`,
        isNotNull(users.avatarUrl),
        eq(users.avatarCompleted, 1),
        notInArray(users.username, [...REMOVED_AGENT_USERNAMES])
      ));

    const totalPlayers = allPlayers.length;

    // ── 2. Bulk ownership aggregates (2 queries) ──
    const ownerCounts = await db
      .select({
        ownedId: ownership.ownedId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(ownership)
      .groupBy(ownership.ownedId);

    const ownedCounts = await db
      .select({
        ownerId: ownership.ownerId,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(ownership)
      .groupBy(ownership.ownerId);

    // ── 3. Owned player value sums for portfolio calc (includes sub-ownership multiplier) ──
    const ownedValueSums = await db
      .select({
        ownerId: ownership.ownerId,
        totalValue: sql<number>`COALESCE(SUM(${users.playerValue} * (1 + (SELECT COUNT(*) FROM ownership o2 WHERE o2.owner_id = ${users.id}))), 0)`.as("total_value"),
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .groupBy(ownership.ownerId);

    // Build lookup maps
    const ownerMap = new Map(ownerCounts.map((r) => [r.ownedId, Number(r.count)]));
    const ownedMap = new Map(ownedCounts.map((r) => [r.ownerId, Number(r.count)]));
    const ownedValueMap = new Map(ownedValueSums.map((r) => [r.ownerId, Number(r.totalValue)]));

    // ── 4. Enrich all players with computed fields ──
    const enriched = allPlayers.map((p) => {
      const ownerCount = ownerMap.get(p.id) ?? 0;
      const ownedCount = ownedMap.get(p.id) ?? 0;
      const ownedTotal = ownedValueMap.get(p.id) ?? 0;
      const basePortfolio = p.playerValue + ownedTotal;
      const portfolioValue = Math.round(basePortfolio * Math.max(ownerCount, 1) * 100) / 100;
      return { ...p, ownerCount, ownedCount, portfolioValue };
    });

    // ── 5. Sort & slice for each category (all in JS — fast) ──
    const topOwners = [...enriched]
      .sort((a, b) => b.ownerCount - a.ownerCount || b.playerValue - a.playerValue)
      .slice(0, 5);

    const topEmpire = [...enriched]
      .sort((a, b) => b.ownedCount - a.ownedCount || b.playerValue - a.playerValue)
      .slice(0, 5);

    const topPortfolio = [...enriched]
      .sort((a, b) => b.portfolioValue - a.portfolioValue)
      .slice(0, 5);

    const topCredits = [...enriched]
      .sort((a, b) => b.credits - a.credits)
      .slice(0, 5);

    const topValue = [...enriched]
      .sort((a, b) => b.playerValue - a.playerValue)
      .slice(0, 5);

    // ── 6. Fetch avatars ONLY for the players that appear in the top lists ──
    // (We avoid selecting avatarUrl in the bulk query above because base64
    // avatars on all 100+ players can OOM Neon — this is safe for ≤40 rows.)
    const topIds = Array.from(
      new Set(
        [...topOwners, ...topEmpire, ...topPortfolio, ...topCredits, ...topValue].map(
          (p) => p.id
        )
      )
    );

    let avatarMap = new Map<number, string | null>();
    if (topIds.length > 0) {
      const avatarRows = await db
        .select({ id: users.id, avatarUrl: users.avatarUrl })
        .from(users)
        .where(inArray(users.id, topIds));
      avatarMap = new Map(avatarRows.map((r) => [r.id, r.avatarUrl]));
    }

    const attachAvatar = <T extends { id: number }>(list: T[]) =>
      list.map((p) => ({ ...p, avatarUrl: avatarMap.get(p.id) ?? null }));

    return NextResponse.json({
      topOwners: attachAvatar(topOwners),
      topEmpire: attachAvatar(topEmpire),
      topPortfolio: attachAvatar(topPortfolio),
      topCredits: attachAvatar(topCredits),
      topValue: attachAvatar(topValue),
      totalPlayers,
    }, {
      // Public leaderboards polled every 60s by all clients — cache at the CDN.
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (error) {
    console.error("Ranks API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch ranks" },
      { status: 500 }
    );
  }
}
