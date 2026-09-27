import { NextResponse } from "next/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { ownership, users, cityLayoutMeta } from "@/db/schema";
import { pusher } from "@/lib/pusher-server";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { MISSIONS } from "@/lib/missions-data";
import { sectorsUnlocked } from "@/lib/city/projection";
import { invalidReason, layoutPatchSchema } from "@/lib/city/layout-schema";

/**
 * POST /api/city/layout — owner-only placement mutation (MAINFRAME_CITY_RTS
 * §D5/§D7/§D8). Cosmetic ONLY: city_layout/city_layout_meta are the sole
 * write targets; no economy table is ever touched.
 *
 * SECURITY: owner id comes ONLY from the auth() session (TH-02). Ownership is
 * re-validated twice — a pre-check that fails fast with 409, and a
 * WHERE EXISTS(ownership) guard INSIDE the multi-row INSERT that catches
 * mid-flight poaches per-card into `rejected` (TH-03; neon-http has no
 * transactions, so the guard is the race fence). Zod validates shape/bounds/
 * enums/disjointness at the boundary (TH-04). A ≥500 ms per-owner cooldown
 * reads the meta row's updated_at BEFORE the CAS bump (the bump itself writes
 * updated_at; TH-05). No Cache-Control here — authed mutation route.
 *
 * STATEMENT ORDER (sequential, each step re-checked — no transactions):
 *  1. auth → 401; zod → 400
 *  2. throttle read (DB-clock comparison, pre-bump) → 429
 *  3. lazy orphan cleanup (DELETE rows with no matching ownership — §D7)
 *  4. ownership pre-check → 409
 *  5. sector unlock check (missionLevel via sectorsUnlocked) → 403
 *  6. collision pre-check (batch tiles, excluding cards moved/removed in
 *     this batch) → 409
 *  7. CAS: ensure meta row (epoch updated_at so a fresh row never throttles
 *     a mismatch retry), then single-row UPDATE ... WHERE layout_version =
 *     baseVersion RETURNING — rowcount 0 → 409 + currentLayoutVersion
 *  8. DELETE old rows for the batch's cardIds, then ONE guarded multi-row
 *     INSERT ... SELECT FROM unnest(...) WHERE EXISTS(ownership) RETURNING;
 *     23505 unique violation → 409 "Tile already occupied"
 *  9. best-effort Pusher `city-layout-updated` on player-{ownerId}
 */

/** Throttle window (TH-05): min interval between a owner's layout writes. */
const THROTTLE_MS = 500;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const ownerId = parseInt(session.user.id);

  try {
    const body = await req.json().catch(() => null);
    const parsed = layoutPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.issues.map((i) => i.message).slice(0, 3),
        },
        { status: 400 }
      );
    }
    const { baseVersion, placements, removedCardIds } = parsed.data;
    const batchCardIds = Array.from(
      new Set([...placements.map((p) => p.cardId), ...(removedCardIds ?? [])])
    );

    // --- 2. Per-owner throttle, evaluated on the DB clock BEFORE the CAS
    // bump touches updated_at. Absent row = never written = not throttled.
    const [throttleRow] = await db
      .select({
        throttled: sql<boolean>`(${cityLayoutMeta.updatedAt} > NOW() - (${THROTTLE_MS} * INTERVAL '1 millisecond'))`,
      })
      .from(cityLayoutMeta)
      .where(eq(cityLayoutMeta.ownerUserId, ownerId));
    if (throttleRow?.throttled) {
      return NextResponse.json(
        { error: "Too many layout updates" },
        { status: 429 }
      );
    }

    // --- 3. Lazy orphan cleanup (§D7): rows whose card is no longer owned.
    await db.execute(sql`
      DELETE FROM city_layout
      WHERE owner_user_id = ${ownerId}
        AND NOT EXISTS (
          SELECT 1 FROM ownership o
          WHERE o.owner_id = ${ownerId} AND o.owned_id = city_layout.owned_player_id
        )
    `);

    // --- 4. Ownership pre-check (fail fast; the INSERT re-checks per row).
    // Goddesses are fixed landmarks (§D7), never placeable — reject here so
    // no inert layout row can occupy a tile / the owner_avatar unique slot.
    const goddessSet = new Set(GODDESS_USERNAMES);
    const ownedRows = await db
      .select({ ownedId: ownership.ownedId, username: users.username })
      .from(ownership)
      .innerJoin(users, eq(ownership.ownedId, users.id))
      .where(
        and(
          eq(ownership.ownerId, ownerId),
          inArray(
            ownership.ownedId,
            placements.map((p) => p.cardId)
          )
        )
      );
    const ownedIds = new Set(ownedRows.map((r) => r.ownedId));
    if (placements.some((p) => !ownedIds.has(p.cardId))) {
      return NextResponse.json(
        { error: "Avatar no longer owned" },
        { status: 409 }
      );
    }
    if (ownedRows.some((r) => goddessSet.has(r.username))) {
      return NextResponse.json(
        { error: "Avatar is a landmark, not placeable" },
        { status: 400 }
      );
    }

    // --- 5. Sector unlock check (mission ladder is the only authority).
    const [me] = await db
      .select({ missionLevel: users.missionLevel })
      .from(users)
      .where(eq(users.id, ownerId));
    if (!me) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const unlocked = sectorsUnlocked(me.missionLevel, MISSIONS.length);
    for (const p of placements) {
      const reason = invalidReason(p, unlocked);
      if (reason === "Sector not unlocked") {
        return NextResponse.json(
          { error: "Sector not unlocked" },
          { status: 403 }
        );
      }
      if (reason) {
        // Unreachable post-zod; kept as defense in depth (TH-04).
        return NextResponse.json(
          { error: "Invalid request body", details: [reason] },
          { status: 400 }
        );
      }
    }

    // --- 6. Collision pre-check: occupied tiles excluding cards being
    // moved/removed in this batch (their rows are deleted in step 8, so
    // their tiles are being vacated atomically with this patch).
    const batchIdList = sql.join(
      batchCardIds.map((id) => sql`${id}`),
      sql`, `
    );
    const collisionRows = await db.execute(sql`
      SELECT c.owned_player_id
      FROM city_layout c
      JOIN (
        SELECT * FROM unnest(
          ARRAY[${sql.join(placements.map((p) => sql`${p.sector}`), sql`, `)}]::varchar[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.x}`), sql`, `)}]::int[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.y}`), sql`, `)}]::int[]
        ) AS t(sector, x, y)
      ) t ON t.sector = c.sector_key AND t.x = c.tile_x AND t.y = c.tile_y
      WHERE c.owner_user_id = ${ownerId}
        AND NOT (c.owned_player_id = ANY(ARRAY[${batchIdList}]::int[]))
      LIMIT 1
    `);
    if (collisionRows.rows.length > 0) {
      return NextResponse.json(
        { error: "Tile already occupied" },
        { status: 409 }
      );
    }

    // --- 7. CAS version bump. Ensure the meta row exists first (epoch
    // updated_at: a brand-new row must not throttle the retry that follows
    // a baseVersion mismatch). The single-row UPDATE is the atomic
    // compare-and-swap that replaces a transaction.
    await db
      .insert(cityLayoutMeta)
      .values({
        ownerUserId: ownerId,
        layoutVersion: 0,
        updatedAt: new Date(0),
      })
      .onConflictDoNothing();
    const casRows = await db
      .update(cityLayoutMeta)
      .set({
        layoutVersion: sql`${cityLayoutMeta.layoutVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(cityLayoutMeta.ownerUserId, ownerId),
          eq(cityLayoutMeta.layoutVersion, baseVersion)
        )
      )
      .returning({ layoutVersion: cityLayoutMeta.layoutVersion });
    if (casRows.length === 0) {
      const [current] = await db
        .select({ layoutVersion: cityLayoutMeta.layoutVersion })
        .from(cityLayoutMeta)
        .where(eq(cityLayoutMeta.ownerUserId, ownerId));
      return NextResponse.json(
        {
          error: "Layout version mismatch",
          currentLayoutVersion: current?.layoutVersion ?? 0,
        },
        { status: 409 }
      );
    }
    const newVersion = casRows[0].layoutVersion;

    // --- 8. Delete the batch's old rows (frees prior tiles + the
    // owner_avatar unique index), then ONE guarded multi-row INSERT. The
    // WHERE EXISTS(ownership) is the mid-flight-poach race guard: rows lost
    // since step 4 are silently filtered and reported per-card below.
    try {
      await db.execute(sql`
        DELETE FROM city_layout
        WHERE owner_user_id = ${ownerId}
          AND owned_player_id = ANY(ARRAY[${batchIdList}]::int[])
      `);
      const inserted = await db.execute(sql`
        INSERT INTO city_layout
          (owner_user_id, owned_player_id, sector_key, tile_x, tile_y, rotation, variant, layout_version)
        SELECT ${ownerId}, t.card_id, t.sector, t.x, t.y, t.rot, t.variant, ${newVersion}
        FROM unnest(
          ARRAY[${sql.join(placements.map((p) => sql`${p.cardId}`), sql`, `)}]::int[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.sector}`), sql`, `)}]::varchar[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.x}`), sql`, `)}]::int[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.y}`), sql`, `)}]::int[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.rotation}`), sql`, `)}]::int[],
          ARRAY[${sql.join(placements.map((p) => sql`${p.variant}`), sql`, `)}]::int[]
        ) AS t(card_id, sector, x, y, rot, variant)
        WHERE EXISTS (
          SELECT 1 FROM ownership o
          WHERE o.owner_id = ${ownerId} AND o.owned_id = t.card_id
        )
        RETURNING owned_player_id
      `);
      const applied = new Set(
        inserted.rows.map((r) => Number(r.owned_player_id))
      );
      const rejected = placements
        .filter((p) => !applied.has(p.cardId))
        .map((p) => ({ cardId: p.cardId, reason: "Avatar no longer owned" }));

      // --- 9. Best-effort Pusher (never fails the write — purchaseCore idiom).
      try {
        await pusher.trigger(`player-${ownerId}`, "city-layout-updated", {
          layoutVersion: newVersion,
        });
      } catch (pusherError) {
        console.error("Pusher error on city layout update:", pusherError);
      }

      return NextResponse.json({
        success: true,
        layoutVersion: newVersion,
        applied: [...applied],
        rejected,
      });
    } catch (error) {
      // Concurrent same-tile writes race past step 6; the unique index
      // idx_city_layout_owner_tile makes the loser's INSERT fail here. The
      // version already bumped — the client retries with the fresh version.
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("23505") || /unique/i.test(msg)) {
        return NextResponse.json(
          { error: "Tile already occupied" },
          { status: 409 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("City layout update error:", error);
    return NextResponse.json(
      { error: "Failed to update layout" },
      { status: 500 }
    );
  }
}
