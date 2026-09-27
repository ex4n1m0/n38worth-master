import { NextResponse } from "next/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership, users, cityLayout, cityLayoutMeta } from "@/db/schema";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { DETAILED_LIMIT } from "@/lib/city/projection";
import { toQueueBuilding } from "@/lib/city/layout-merge";
import type { CityOwnedCard } from "@/lib/city/types";

/**
 * GET /api/city/my-layout — owner-only placement queue (MAINFRAME_CITY_RTS
 * §D5 route 2). Authed: MUST stay `Cache-Control: private, no-store` (never
 * s-maxage — AGENTS.md CDN rule) because, unlike the public city route, it
 * includes the owner's HIDDEN cards (that is its whole point — TH-01: the
 * public projection must never disclose them).
 *
 * Queue = every current ownership row of the caller (hidden included) that
 * has NO city_layout row — placed buildings leave the queue the moment
 * their placement persists (and re-enter it when ownership is lost and the
 * row orphans, which is exactly the §D7 re-hire-resurrects semantics).
 * Capped at DETAILED_LIMIT for sanity, mapped to the CityBuilding shape via
 * the shared tier/protection helpers in layout-merge.ts (never duplicated
 * here). Goddesses are excluded: CityBuilding is the non-goddess building
 * shape — goddesses are fixed landmarks (§D7), not placeable cards. Queue
 * items are unplaced by definition (placement: null).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownerId = parseInt(session.user.id);

  try {
    const [meta] = await db
      .select({ layoutVersion: cityLayoutMeta.layoutVersion })
      .from(cityLayoutMeta)
      .where(eq(cityLayoutMeta.ownerUserId, ownerId));

    // No visibleSql filter — the owner sees their own hidden cards. Joined
    // query, so raw sql renders qualified names (Drizzle no-join gotcha N/A).
    const goddessNamesSql = sql.join(
      GODDESS_USERNAMES.map((name) => sql`${name}`),
      sql`, `
    );
    const rows = await db
      .select({
        cardId: users.id,
        username: users.username,
        profession: users.profession,
        playerValue: users.playerValue,
        valueFloor: users.valueFloor,
        isNpc: users.isNpc,
        blockSellUntil: ownership.blockSellUntil,
        permBlockUntil: ownership.permBlockUntil,
      })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .leftJoin(
        cityLayout,
        and(
          eq(cityLayout.ownerUserId, ownerId),
          eq(cityLayout.ownedPlayerId, users.id)
        )
      )
      .where(
        and(
          eq(ownership.ownerId, ownerId),
          sql`"users"."username" NOT IN (${goddessNamesSql})`,
          isNull(cityLayout.id)
        )
      )
      // Canonical projection order: value desc, id asc.
      .orderBy(desc(users.playerValue), asc(users.id))
      .limit(DETAILED_LIMIT);

    const now = new Date();
    const queue = rows.map((row): CityOwnedCard => ({
      cardId: row.cardId,
      username: row.username,
      profession: row.profession,
      playerValue: row.playerValue,
      valueFloor: row.valueFloor,
      isNpc: row.isNpc,
      blockSellUntil: row.blockSellUntil ? row.blockSellUntil.toISOString() : null,
      permBlockUntil: row.permBlockUntil ? row.permBlockUntil.toISOString() : null,
    })).map((card) => toQueueBuilding(card, now));

    return NextResponse.json(
      { layoutVersion: meta?.layoutVersion ?? 0, queue },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error("City my-layout error:", error);
    return NextResponse.json(
      { error: "Failed to fetch layout" },
      { status: 500 }
    );
  }
}
