import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, desc, asc, and, isNotNull } from "drizzle-orm";

// Humans must have an avatar to appear on public rankings; NPCs are excluded here anyway.
const visibleHumanWhere = and(
  eq(users.isNpc, 0),
  isNotNull(users.avatarUrl),
  eq(users.avatarCompleted, 1)
);

const VALID_TYPES = ["portfolio", "demand", "empire", "legacy", "credits", "value"] as const;
type RankType = (typeof VALID_TYPES)[number];

async function enrichPlayers(
  players: {
    id: number;
    username: string;
    avatarUrl: string | null;
    playerValue: number;
    createdAt: Date | null;
    credits?: number;
  }[]
) {
  return Promise.all(
    players.map(async (p) => {
      const [ownerCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownedId, p.id));
      const [ownedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownerId, p.id));
      return {
        ...p,
        ownerCount: Number(ownerCount.count),
        ownedCount: Number(ownedCount.count),
      };
    })
  );
}

async function getPortfolioLeaderboard() {
  // Use a single SQL query instead of N+1
  // Only count owned players who themselves own other players
  const portfolioSql = sql<number>`(
    "users"."player_value" + COALESCE(
      (SELECT SUM(u2.player_value) FROM ownership o JOIN users u2 ON o.owned_id = u2.id WHERE o.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o3 WHERE o3.owner_id = u2.id) > 0), 0
    )
  ) * GREATEST(
    (SELECT COUNT(*) FROM ownership o4 WHERE o4.owned_id = "users"."id"), 1
  )`;

  const topPortfolioRaw = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
      credits: users.credits,
      portfolioValue: portfolioSql.as("portfolio_value"),
    })
    .from(users)
    .where(visibleHumanWhere)
    .orderBy(desc(portfolioSql))
    .limit(10);

  // Enrich with owner/owned counts
  const results = await Promise.all(
    topPortfolioRaw.map(async (p) => {
      const [ownerCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownedId, p.id));
      const [ownedCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(ownership)
        .where(eq(ownership.ownerId, p.id));
      return {
        ...p,
        portfolioValue: Math.round(Number(p.portfolioValue) * 100) / 100,
        ownerCount: Number(ownerCount.count),
        ownedCount: Number(ownedCount.count),
      };
    })
  );

  return results;
}

async function getDemandLeaderboard() {
  const topOwnersRaw = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
      credits: users.credits,
    })
    .from(users)
    .where(visibleHumanWhere)
    .orderBy(
      desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = ${users.id})`),
      desc(users.playerValue)
    )
    .limit(10);

  return enrichPlayers(topOwnersRaw);
}

async function getEmpireLeaderboard() {
  const topEmpireRaw = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
      credits: users.credits,
    })
    .from(users)
    .where(visibleHumanWhere)
    .orderBy(
      desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = ${users.id})`),
      desc(users.playerValue)
    )
    .limit(10);

  return enrichPlayers(topEmpireRaw);
}

async function getLegacyLeaderboard() {
  const topLegacyRaw = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
      credits: users.credits,
    })
    .from(users)
    .where(visibleHumanWhere)
    .orderBy(asc(users.createdAt))
    .limit(10);

  return enrichPlayers(topLegacyRaw);
}

async function getCreditsLeaderboard() {
  const topCreditsRaw = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
      credits: users.credits,
    })
    .from(users)
    .where(visibleHumanWhere)
    .orderBy(desc(users.credits))
    .limit(10);

  return enrichPlayers(topCreditsRaw);
}

async function getValueLeaderboard() {
  const topValueRaw = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      createdAt: users.createdAt,
      credits: users.credits,
    })
    .from(users)
    .where(visibleHumanWhere)
    .orderBy(desc(users.playerValue))
    .limit(10);

  return enrichPlayers(topValueRaw);
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params;

    if (!VALID_TYPES.includes(type as RankType)) {
      return NextResponse.json({ error: "Invalid rank type" }, { status: 400 });
    }

    // Get total player count (exclude NPCs)
    const [countResult] = await db
      .select({ total: sql<number>`COUNT(*)` })
      .from(users)
      .where(visibleHumanWhere);
    const totalPlayers = Number(countResult.total);

    let players;
    switch (type as RankType) {
      case "portfolio":
        players = await getPortfolioLeaderboard();
        break;
      case "demand":
        players = await getDemandLeaderboard();
        break;
      case "empire":
        players = await getEmpireLeaderboard();
        break;
      case "legacy":
        players = await getLegacyLeaderboard();
        break;
      case "credits":
        players = await getCreditsLeaderboard();
        break;
      case "value":
        players = await getValueLeaderboard();
        break;
    }

    return NextResponse.json({ players, totalPlayers });
  } catch (error) {
    console.error("Rank API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rank leaderboard" },
      { status: 500 }
    );
  }
}
