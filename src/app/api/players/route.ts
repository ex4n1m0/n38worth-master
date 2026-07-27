import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, sql, ilike, desc, asc, and, ne, notInArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";
import { getGoddessPowers } from "@/lib/goddess-powers";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "most-owned";
  // Sort direction for the Core-6 sorts (value/credits/score/hired-times/
  // last-online/newest). Defaults to descending (highest / most-recent first).
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const hasOwner = searchParams.get("hasOwner") || "";
  const noBoss = searchParams.get("noBoss") || "";
  const hasPlayers = searchParams.get("hasPlayers") || "";
  const playerType = searchParams.get("playerType") || "";
  const hasRevealedAvatar = searchParams.get("hasRevealedAvatar") || "";
  const noPartner = searchParams.get("noPartner") || "";
  const profession = searchParams.get("profession") || "";
  const ownerFilter = searchParams.get("ownerFilter") || "";
  const affordable = searchParams.get("affordable") === "true";
  const offset = (page - 1) * limit;

  try {
    // Get current user session to exclude self and owned players
    const session = await auth();
    const currentUserId = session?.user?.id ? Number(session.user.id) : null;

    // "Affordable" filter: only show cards whose full ACTION cost is within
    // the requesting user's credit balance. Requires a logged-in user; when no
    // session is present the filter is a no-op (we still return the rest).
    let userCredits: number | null = null;
    let viewerHasWar = false;
    if (affordable && currentUserId) {
      const [row] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, currentUserId))
        .limit(1);
      userCredits = row ? Number(row.credits) : null;
      // War power waives normal break fees, making blocked cards cost just
      // their value — factor it in so the filter matches what the UI charges.
      try {
        viewerHasWar = (await getGoddessPowers(currentUserId)).hasWar;
      } catch {
        viewerHasWar = false;
      }
    }

    // Build WHERE conditions
    const conditions = [];

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
        conditions.push(sql`"owner_info"."owned_id" IS NOT NULL`);
      } else if (ownerFilter === "none") {
        conditions.push(sql`"owner_info"."owned_id" IS NULL`);
      } else if (ownerFilter === "owns") {
        // Players that own other players (i.e. have at least one ownership row
        // as the owner).
        conditions.push(sql`COALESCE("owned_counts"."count", 0) > 0`);
      }
    }

    if (search) {
      conditions.push(ilike(users.username, `%${search}%`));
    }
    // Affordable: only cards the current user can act on with their credits.
    // It's a shopping filter for NEW cards, so anything the viewer already
    // owns is excluded entirely. The hire cost is the card's value, but cards
    // under an active sell block cost extra to acquire (break fee + hire).
    // Mirror the client's displayed formula (PlayerCard) so the filter hides
    // exactly the cards the UI grays out: fee = 1000x value for fate seals
    // (>30 days remaining), 0 with War power, otherwise
    // ceil(hours remaining) x value.
    if (affordable && userCredits !== null) {
      conditions.push(
        sql`NOT EXISTS (SELECT 1 FROM ownership o WHERE o.owned_id = "users"."id" AND o.owner_id = ${currentUserId})`
      );
      conditions.push(sql`"users"."player_value" <= ${userCredits}`);
      conditions.push(sql`(
        COALESCE((
          SELECT CASE
            WHEN MAX(o.block_sell_until) > NOW() + INTERVAL '30 days'
              THEN "users"."player_value"::numeric * 1001
            WHEN ${viewerHasWar} THEN "users"."player_value"::numeric
            ELSE (CEIL(EXTRACT(EPOCH FROM (MAX(o.block_sell_until) - NOW())) / 3600) + 1) * "users"."player_value"::numeric
          END
          FROM ownership o
          WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW()
        ), "users"."player_value"::numeric) <= ${userCredits}
      )`);
    }
    if (hasOwner === "true") {
      conditions.push(sql`"owner_info"."owned_id" IS NOT NULL`);
    }
    if (noBoss === "true") {
      conditions.push(sql`"owner_info"."owned_id" IS NULL`);
    }
    if (hasPlayers === "true") {
      conditions.push(sql`COALESCE("owned_counts"."count", 0) > 0`);
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

    // Exclude the Mass Hire card from regular browse results — it's pinned
    // separately at the top-left of the market page.
    conditions.push(sql`"users"."username" <> 'Mass Hire'`);

    // Exclude the removed support Agent — it's not a hireable card and
    // shouldn't appear in the player browser.
    conditions.push(notInArray(users.username, [...REMOVED_AGENT_USERNAMES]));

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

    // CTEs: pre-calculate ownership counts and owner info once per row instead
    // of running the same correlated COUNT subqueries 9+ times per row.
    // owner_info: one row per owned user (owned_id has a UNIQUE index) with the
    // owner's username and player_value — replaces correlated subqueries for
    // ownerName, ownerValue, and ownerCount.
    const ownerInfoCte = db.$with("owner_info").as(
      db.select({
        ownedId: ownership.ownedId,
        ownerName: users.username,
        ownerValue: users.playerValue,
      })
        .from(ownership)
        .innerJoin(users, eq(users.id, ownership.ownerId))
    );
    // owned_counts: how many players each user owns (aggregated once).
    const ownedCountsCte = db.$with("owned_counts").as(
      db.select({
        ownerId: ownership.ownerId,
        count: sql<number>`count(*)`.as("count"),
      }).from(ownership).groupBy(ownership.ownerId)
    );

    // ownerCount = 0 or 1 (owned_id has a UNIQUE index, so at most one owner).
    const ownerCountExpr = sql<number>`CASE WHEN "owner_info"."owned_id" IS NOT NULL THEN 1 ELSE 0 END`;
    const ownedCountExpr = sql<number>`COALESCE("owned_counts"."count", 0)`;
    const portfolioExpr = sql<number>`LEAST(COALESCE((SELECT SUM(u2.player_value::numeric) FROM ownership o2 JOIN users u2 ON o2.owned_id = u2.id JOIN "owned_counts" od2 ON od2.owner_id = u2.id WHERE o2.owner_id = "users"."id"), 0) * GREATEST(CASE WHEN "owner_info"."owned_id" IS NOT NULL THEN 1 ELSE 0 END, 1), 9007199254740991)`;
    const ownerNameExpr = sql<string | null>`"owner_info"."username"`;
    const ownerValueExpr = sql<number | null>`"owner_info"."player_value"`;

    const selectFields = {
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      playerValue: users.playerValue,
      valueFloor: users.valueFloor,
      credits: users.credits,
      blockSellUntil: sql<string | null>`(SELECT to_char(o.block_sell_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.block_sell_until > NOW() ORDER BY o.block_sell_until DESC LIMIT 1)`.as("block_sell_until"),
      permBlockUntil: currentUserId
        ? sql<string | null>`(SELECT to_char(o.perm_block_until, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM ownership o WHERE o.owned_id = "users"."id" AND o.owner_id = ${currentUserId} AND o.perm_block_until IS NOT NULL LIMIT 1)`.as("perm_block_until")
        : sql<string | null>`NULL`.as("perm_block_until"),
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

    // Base query with CTEs and LEFT JOINs — replaces 9+ correlated COUNT
    // subqueries per row with pre-calculated CTE columns.
    const baseQuery = db
      .with(ownerInfoCte, ownedCountsCte)
      .select(selectFields)
      .from(users)
      .leftJoin(ownerInfoCte, eq(ownerInfoCte.ownedId, users.id))
      .leftJoin(ownedCountsCte, eq(ownedCountsCte.ownerId, users.id));
    const filteredQuery = whereClause ? baseQuery.where(whereClause) : baseQuery;

    if (hasOwner === "true") {
      playersList = await filteredQuery
        .orderBy(
          asc(sql`LOWER("owner_info"."username")`),
          desc(users.playerValue)
        )
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-owned") {
      playersList = await filteredQuery
        .orderBy(desc(sql`CASE WHEN "owner_info"."owned_id" IS NOT NULL THEN 1 ELSE 0 END`), desc(users.lastOnlineAt))
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-players") {
      playersList = await filteredQuery
        .orderBy(desc(sql`COALESCE("owned_counts"."count", 0)`), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "online-cheapest") {
      playersList = await filteredQuery
        .orderBy(desc(users.lastOnlineAt), asc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "most-hired") {
      playersList = await filteredQuery
        .orderBy(desc(users.purchaseCount), desc(users.playerValue))
        .limit(limit)
        .offset(offset);
    } else if (sort === "profession" && false) {
      // Combo-friendly ordering: rank players within each profession by value
      // (highest first), then interleave across professions so the top pick of
      // every profession surfaces first — making it easy to assemble the 6-set.
      // Players without a profession (goddesses/hidden) sort to the end.
      playersList = await filteredQuery
        .orderBy(
          asc(sql`("users"."profession" IS NULL)`),
          asc(sql`ROW_NUMBER() OVER (PARTITION BY "users"."profession" ORDER BY "users"."player_value" DESC NULLS LAST)`),
          asc(sql`"users"."profession"`),
          desc(users.playerValue)
        )
        .limit(limit)
        .offset(offset);
    } else {
      // Core-6 sorts honour the `dir` (asc/desc) param. Legacy keys
      // ("name" asc, "cheapest" asc) keep their fixed direction.
      const dirFn = dir === "asc" ? asc : desc;
      const orderBy =
        sort === "newest"
          ? dirFn(users.createdAt)
          : sort === "last-online"
            ? dirFn(users.lastOnlineAt)
            : sort === "hired-times"
              ? dirFn(users.purchaseCount)
              : sort === "name"
                ? asc(users.username)
                : sort === "cheapest"
                  ? asc(users.playerValue)
                  : sort === "credits"
                    ? dirFn(users.credits)
                    : sort === "score"
                      ? dirFn(sql`COALESCE("users"."photo_score", 0)`)
                      : dirFn(users.playerValue);

      // All Core-6 sorts (including "last-online") use a single ordering —
      // no ownership-tier bucketing. "Last Online" simply sorts by lastOnlineAt
      // across all players regardless of owner status.
      playersList = await filteredQuery
        .orderBy(orderBy)
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

    const countBase = db
      .with(ownerInfoCte, ownedCountsCte)
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .leftJoin(ownerInfoCte, eq(ownerInfoCte.ownedId, users.id))
      .leftJoin(ownedCountsCte, eq(ownedCountsCte.ownerId, users.id));
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