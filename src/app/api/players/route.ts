import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, sql, ilike, desc, asc, and, ne, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { BONUS_CARD_USERNAMES } from "@/lib/bonus-cards";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "last-online";
  const hasOwner = searchParams.get("hasOwner") || "";
  const noBoss = searchParams.get("noBoss") || "";
  const hasPlayers = searchParams.get("hasPlayers") || "";
  const playerType = searchParams.get("playerType") || "";
  const hasRevealedAvatar = searchParams.get("hasRevealedAvatar") || "";
  const noPartner = searchParams.get("noPartner") || "";
  const offset = (page - 1) * limit;

  try {
    // Get current user session to exclude self and owned players
    const session = await auth();
    const currentUserId = session?.user?.id ? Number(session.user.id) : null;

    // Build WHERE conditions
    const conditions = [];

    // Exclude the current user from browse results
    if (currentUserId) {
      conditions.push(ne(users.id, currentUserId));
      // Exclude players the current user already owns
      conditions.push(
        sql`"users"."id" NOT IN (SELECT o.owned_id FROM ownership o WHERE o.owner_id = ${currentUserId})`
      );
    }

    if (search) {
      conditions.push(ilike(users.username, `%${search}%`));
    }
    if (hasOwner === "true") {
      conditions.push(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") > 0`);
    }
    if (noBoss === "true") {
      conditions.push(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") = 0`);
    }
    if (hasPlayers === "true") {
      conditions.push(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id") > 0`);
    }
    if (playerType === "human") {
      conditions.push(eq(users.isNpc, 0));
    } else if (playerType === "card") {
      conditions.push(eq(users.isNpc, 1));
    }
    if (noPartner === "true") {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW())`
      );
    }
    if (hasRevealedAvatar === "true") {
      // Show players with an active avatar reveal from either source
      conditions.push(
        sql`(
          (SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id" AND o.avatar_reveal_until > NOW()) > 0
          OR
          (SELECT COUNT(*) FROM avatar_reveals ar WHERE ar.target_id = "users"."id" AND ar.reveal_until > NOW()) > 0
        )`
      );
    }

    // Hide any player without an avatar. Humans must also have avatar_completed = 1.
    conditions.push(
      sql`("users"."avatar_url" IS NOT NULL AND ("users"."is_npc" = 1 OR "users"."avatar_completed" = 1))`
    );

    // Exclude goddesses and bonus cards from the network page
    conditions.push(notInArray(users.username, GODDESS_USERNAMES));
    conditions.push(notInArray(users.username, BONUS_CARD_USERNAMES));

    const whereClause = conditions.length > 0
      ? and(...conditions)
      : undefined;

    // SQL subqueries for counts and portfolio value (avoids N+1 queries)
    const ownerCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`;
    const ownedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const portfolioExpr = sql<number>`LEAST(("users"."player_value"::numeric + COALESCE((SELECT SUM(u2.player_value::numeric) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o4 WHERE o4.owner_id = u2.id) > 0), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o3 WHERE o3.owned_id = "users"."id"), 1), 9007199254740991)`;
    const ownerNameExpr = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const ownerValueExpr = sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;

    // Common select fields with computed columns
    const selectFields = {
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
      credits: users.credits,
      blockSellUntil: sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW() ORDER BY o.block_sell_until DESC LIMIT 1)`.as("block_sell_until"),
      estimatedDeletionAt: users.estimatedDeletionAt,
      isActive: users.isActive,
      createdAt: users.createdAt,
      totalOnlineMinutes: users.totalOnlineMinutes,
      lastOnlineAt: users.lastOnlineAt,
      isVerified: users.isVerified,
      playerType: sql<string>`CASE WHEN "users"."is_npc" = 1 THEN 'card' ELSE 'human' END`,
      photoAuthorName: users.photoAuthorName,
      photoAuthorUrl: users.photoAuthorUrl,
      photoSourceUrl: users.photoSourceUrl,
      purchaseCount: users.purchaseCount,
      bio: users.bio,
      ownerCount: ownerCountExpr.as("owner_count"),
      ownedCount: ownedCountExpr.as("owned_count"),
      portfolioValue: portfolioExpr.as("portfolio_value"),
      ownerName: ownerNameExpr.as("owner_name"),
      ownerValue: ownerValueExpr.as("owner_value"),
      avatarRevealUntil: sql<string | null>`GREATEST(
        (SELECT to_char(o.avatar_reveal_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.avatar_reveal_until > NOW() ORDER BY o.avatar_reveal_until DESC LIMIT 1),
        (SELECT to_char(ar.reveal_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM avatar_reveals ar WHERE ar.target_id = "users"."id" AND ar.reveal_until > NOW() ORDER BY ar.reveal_until DESC LIMIT 1)
      )`.as("avatar_reveal_until"),
    };

    let playersList;

    // When "Have Boss" filter is active, sort by boss (owner) name ascending.
    // This overrides the currently selected sort so players are grouped/ordered by their boss.
    if (hasOwner === "true") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(
          asc(sql`LOWER((SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1))`),
          desc(users.playerValue)
        )
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-owned") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-players") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "online-cheapest") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(users.lastOnlineAt), asc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-hired") {
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(desc(users.purchaseCount), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else {
      const orderBy =
        sort === "newest"
          ? desc(users.createdAt)
          : sort === "last-online"
            ? desc(users.lastOnlineAt)
            : sort === "name"
              ? asc(users.username)
              : sort === "cheapest"
                ? asc(users.playerValue)
                : sort === "credits"
                  ? desc(users.credits)
                  : desc(users.playerValue);

      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered.orderBy(orderBy).limit(limit).offset(offset);
    }

    // Map results — all computed fields already included, no extra queries needed
    const playersWithCounts = playersList.map((player) => {
      const ownerCount = Number(player.ownerCount);
      const isNpcWithoutOwner = player.playerType === 'card' && ownerCount === 0;

      // Only NPC players without an owner get deletion countdown
      let estimatedDeletionAt: Date | typeof player.estimatedDeletionAt = null;
      if (isNpcWithoutOwner && player.credits > 1 && player.lastOnlineAt) {
        // Calculate minutes until credits decay to 1: ln(credits) / (-ln(0.99))
        // Each 1% decay happens every 1 minute
        const minutesUntilDeletion = Math.ceil(Math.log(player.credits) / (-Math.log(0.99)));
        estimatedDeletionAt = new Date(Date.now() + minutesUntilDeletion * 60 * 1000);
      } else if (isNpcWithoutOwner && player.credits <= 1) {
        // Already at minimum — deletion imminent
        estimatedDeletionAt = new Date();
      }

      return {
        ...player,
        ownerCount,
        ownedCount: Number(player.ownedCount),
        portfolioValue: Math.round(Number(player.portfolioValue) * 100) / 100,
        estimatedDeletionAt,
        ownerName: player.ownerName,
        ownerValue: player.ownerValue !== null ? Number(player.ownerValue) : null,
      };
    });

    // Get total count with same filters (single query)
    const countBase = db.select({ count: sql<number>`count(*)` }).from(users);
    const countFiltered = whereClause ? countBase.where(whereClause) : countBase;
    const [{ count: total }] = await countFiltered;

    return NextResponse.json({
      players: playersWithCounts,
      total: Number(total),
      page,
      totalPages: Math.ceil(Number(total) / limit),
    });
  } catch (error) {
    console.error("Players API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch players" },
      { status: 500 }
    );
  }
}
