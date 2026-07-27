import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { REMOVED_AGENT_USERNAMES } from "@/lib/agent/roster";

/**
 * Serves a player's avatar as a raw image response (with proper Content-Type
 * and caching headers) so it can be opened in a new tab / full-screen view.
 *
 * This is needed because most NPC avatars are stored as `data:image/webp;base64,...`
 * data URLs, which browsers — especially mobile — refuse to navigate to directly.
 * This route decodes the data URL and streams the raw image bytes back, or
 * redirects to the path-based URL for non-data-URL avatars.
 *
 * Public, no auth required.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  if (REMOVED_AGENT_USERNAMES.includes(username)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const [user] = await db
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  const avatarUrl = user?.avatarUrl;
  if (!avatarUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Data URL → decode and serve raw bytes
  const dataMatch = avatarUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (dataMatch) {
    const [, mimeType, base64] = dataMatch;
    const buffer = Buffer.from(base64, "base64");
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        // Image bytes are proxied through the function — cache aggressively at
        // the CDN (with SWR) so repeat views don't re-invoke it.
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    });
  }

  // Path-based URL (e.g. /NEW_HIDDEN.webp) → redirect
  if (avatarUrl.startsWith("/")) {
    const res = NextResponse.redirect(new URL(avatarUrl, _req.url), 301);
    res.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res;
  }

  // Absolute URL (e.g. Vercel Blob) → redirect
  if (avatarUrl.startsWith("http")) {
    const res = NextResponse.redirect(avatarUrl, 301);
    res.headers.set("Cache-Control", "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400");
    return res;
  }

  return new NextResponse("Not found", { status: 404 });
}
