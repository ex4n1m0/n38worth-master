import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, ownership } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";

const visibleSql = sql`("users"."is_npc" = 1 OR ("users"."avatar_url" IS NOT NULL AND "users"."avatar_completed" = 1))`;

// Hard cap on IDs per request. Avatars are base64 WebP up to ~300 KB each,
// so 50 × ~400 KB (base64-encoded) ≈ 20 MB worst case — but typical avatars
// are far smaller. We rely on this cap (combined with callers requesting
// only the currently-visible page of players) to stay under Vercel's
// ~4.5 MB function payload limit and Neon's 10 MB HTTP response cap.
const MAX_IDS_PER_REQUEST = 50;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  // Only the profile owner may fetch their own avatar map (prevents leaking
  // unrevealed avatars). Comparison is case-insensitive because usernames are
  // displayed/typed with mixed case in URLs while the session value comes
  // from the DB — a case mismatch here used to silently 403 and break the
  // team avatar display on the user's own profile.
  const session = await auth();
  const sessionName = session?.user?.name;
  if (!sessionName || sessionName.toLowerCase() !== username.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawIds = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(rawIds)) {
    return NextResponse.json({ error: "Body must include an `ids` array" }, { status: 400 });
  }

  // Coerce, dedupe, drop invalid entries.
  const ids = Array.from(
    new Set(
      rawIds
        .map((v) => (typeof v === "number" ? v : Number(v)))
        .filter((n) => Number.isFinite(n) && Number.isInteger(n) && n > 0)
    )
  );

  if (ids.length === 0) {
    return NextResponse.json({ avatarMap: {} });
  }

  if (ids.length > MAX_IDS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Too many ids; max ${MAX_IDS_PER_REQUEST} per request` },
      { status: 400 }
    );
  }

  try {
    // Look up the owner by the SESSION username (the source of truth in the
    // DB) rather than the URL fragment, so we still find them even if the
    // URL casing differs.
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, sessionName));

    if (!owner) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Inner-join on `ownership` so the endpoint can only return avatars for
    // players the requester actually owns. Combined with `visibleSql`, NPCs
    // and humans with completed avatars are surfaced; anything else stays
    // absent from the map (client falls back to UNHIRED2.png on its own).
    const rows = await db
      .select({
        id: users.id,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .innerJoin(ownership, eq(ownership.ownedId, users.id))
      .where(and(eq(ownership.ownerId, owner.id), inArray(users.id, ids), visibleSql));

    // Return as a map id -> avatarUrl for easy lookup (string keys survive JSON round-trip)
    const avatarMap: Record<string, string | null> = {};
    for (const row of rows) {
      avatarMap[String(row.id)] = row.avatarUrl;
    }

    return NextResponse.json({ avatarMap });
  } catch (error) {
    console.error("owned-avatars error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
