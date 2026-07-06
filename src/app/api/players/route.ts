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
  const sort = searchParams.get("sort") || "most-owned";
  const hasOwner = searchParams.get("hasOwner") || "";
  const noBoss = searchParams.get("noBoss") || "";
  const hasPlayers = searchParams.get("hasPlayers") || "";
  const playerType = searchParams.get("playerType") || "";
  const hasRevealedAvatar = searchParams.get("hasRevealedAvatar") || "";
  const noPartner = searchParams.get("noPartner") || "";
  const profession = searchParams.get("profession") || "";
  const ownerFilter = searchParams.get("ownerFilter") || "";
  const offset = (page - 1) * limit;

  try {
    // Get current user session to exclude self and owned players
    const session = await auth();
    const currentUserId = session?.user?.id ? Number(session.user.id) : null;

    // Build WHERE conditions
    const conditions = [];

    // Bonus cards never appear in the market. Goddesses are visible.
    conditions.push(
      notInArray(users.username, [...BONUS_CARD_USERNAMES])
    );

    // Filter to a specific profession when requested
    if (profession) {
      conditions.push(eq(users.profession, profession));
    }

    // When sorting by profession, only show players that actually have one so
    // the list is easy to scan for the 6-profession combo sell.
    if (sort === "profession") {
      conditions.push(sql`"users"."profession" IS NOT NULL AND "users"."profession" <> ''`);
    }

    // Exclude the current user from browse results
    if (currentUserId) {
      conditions.push(ne(users.id, currentUserId));
      // Owner filter: "mine" shows only owned players, "other" shows players
      // owned by someone else, "none" shows players with no owner. Default
      // (no filter) shows ALL players (both owned and non-owned).
      if (ownerFilter === "mine") {
        conditions.push(
          sql`"users"."id" IN (SELECT o.owned_id FROM ownership o WHERE o.owner_id = ${currentUserId})`
        );
      } else if (ownerFilter === "other") {
        conditions.push(
          sql`"users"."id" NOT IN (SELECT o.owned_id FROM ownership o WHERE o.owner_id = ${currentUserId})`
        );
        conditions.push(
          sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") > 0`
        );
      } else if (ownerFilter === "none") {
        conditions.push(
          sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") = 0`
        );
      }
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
      conditions.push(
        sql`(
          (SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id" AND o.avatar_reveal_until > NOW()) > 0
          OR
          (SELECT COUNT(*) FROM avatar_reveals ar WHERE ar.target_id = "users"."id" AND ar.reveal_until > NOW()) > 0
        )`
      );
    }

    // Show players with avatars, and also show incomplete onboarding players
    conditions.push(
      sql`(
        ("users"."avatar_url" IS NOT NULL AND ("users"."is_npc" = 1 OR "users"."avatar_completed" = 1)) OR
        ("users"."onboarding_complete" = 0 AND "users"."is_npc" = 0)
      )`
    );

    // Hide onboarding NPCs from other players until the creator completes onboarding
    if (currentUserId) {
      conditions.push(
        sql`(
          "users"."onboarding_created_by" IS NULL OR
          "users"."onboarding_created_by" = ${currentUserId} OR
          NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.id = "users"."onboarding_created_by") OR
          (SELECT u2.onboarding_complete FROM users u2 WHERE u2.id = "users"."onboarding_created_by") = 1
        )`
      );
    } else {
      conditions.push(
        sql`(
          "users"."onboarding_created_by" IS NULL OR
          NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.id = "users"."onboarding_created_by") OR
          (SELECT u2.onboarding_complete FROM users u2 WHERE u2.id = "users"."onboarding_created_by") = 1
        )`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const ownerCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`;
    const ownedCountExpr = sql<number>`(SELECT COUNT(*) FROM ownership o WHERE o.owner_id = "users"."id")`;
    const portfolioExpr = sql<number>`LEAST(("users"."player_value"::numeric + COALESCE((SELECT SUM(u2.player_value::numeric) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id WHERE o2.owner_id = "users"."id" AND (SELECT COUNT(*) FROM ownership o4 WHERE o4.owner_id = u2.id) > 0), 0)) * GREATEST((SELECT COUNT(*) FROM ownership o3 WHERE o3.owned_id = "users"."id"), 1), 9007199254740991)`;
    const ownerNameExpr = sql<string | null>`(SELECT u.username FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;
    const ownerValueExpr = sql<number | null>`(SELECT u.player_value FROM ownership o JOIN users u ON o.owner_id = u.id WHERE o.owned_id = "users"."id" ORDER BY o.purchased_at DESC LIMIT 1)`;

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
      photoScore: users.photoScore,
      purchaseCount: users.purchaseCount,
      bio: users.bio,
      profession: users.profession,
      onboardingComplete: users.onboardingComplete,
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
        .orderBy(desc(sql`(SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id")`), desc(users.lastOnlineAt))
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
    } else if (sort === "profession") {
      // Combo-friendly ordering: rank players within each profession by value
      // (highest first), then interleave across professions so the top pick of
      // every profession surfaces first — making it easy to assemble the 6-set.
      // Players without a profession (goddesses/hidden) sort to the end.
      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      playersList = await filtered
        .orderBy(
          asc(sql`("users"."profession" IS NULL)`),
          asc(sql`ROW_NUMBER() OVER (PARTITION BY "users"."profession" ORDER BY "users"."player_value" DESC NULLS LAST)`),
          asc(sql`"users"."profession"`),
          desc(users.playerValue)
        )
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
                  : sort === "score"
                    ? desc(sql`COALESCE("users"."photo_score", 0)`)
                    : desc(users.playerValue);

      const q = db.select(selectFields).from(users);
      const filtered = whereClause ? q.where(whereClause) : q;
      // Default "last-online" view: group players into ownership tiers —
      // (0) no owner, (1) owned by someone else, (2) owned by ME — and, within
      // each tier, show the most-recently-online first. Other sorts keep their
      // single ordering.
      const ownerBucketExpr = asc(
        currentUserId
          ? sql`(CASE
              WHEN (SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") = 0 THEN 0
              WHEN EXISTS (SELECT 1 FROM ownership o WHERE o.owned_id = "users"."id" AND o.owner_id = ${currentUserId}) THEN 2
              ELSE 1
            END)`
          : sql`(CASE
              WHEN (SELECT COUNT(*) FROM ownership o WHERE o.owned_id = "users"."id") = 0 THEN 0
              ELSE 1
            END)`
      );
      playersList = await (
        sort === "last-online"
          ? filtered.orderBy(ownerBucketExpr, orderBy)
          : filtered.orderBy(orderBy)
      )
        .limit(limit)
        .offset(offset);
    }

    const playersWithCounts = playersList.map((player) => {
      const ownerCount = Number(player.ownerCount);
      const isNpcWithoutOwner = player.playerType === "card" && ownerCount === 0;

      let estimatedDeletionAt: Date | typeof player.estimatedDeletionAt = null;
      if (isNpcWithoutOwner && player.credits > 1 && player.lastOnlineAt) {
        const minutesUntilDeletion = Math.ceil(Math.log(player.credits) / (-Math.log(0.99)));
        estimatedDeletionAt = new Date(Date.now() + minutesUntilDeletion * 60 * 1000);
      } else if (isNpcWithoutOwner && player.credits <= 1) {
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