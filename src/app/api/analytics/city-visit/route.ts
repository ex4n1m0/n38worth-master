import { recordCityVisit } from "@/lib/analytics";
import { NextResponse } from "next/server";

/**
 * Mainframe City visit beacon (Phase F): sent once per public-city page
 * mount via navigator.sendBeacon. Unauthenticated by design — the payload
 * is the visited player's username (public data, same shape as the
 * CDN-cached /api/city/[username]) and the page path. ALWAYS returns 204
 * so a failed analytics write can never surface to the visitor.
 *
 * The username must match the register charset (validators.ts) — an
 * unauthenticated write route must not persist arbitrary strings
 * (security-review hardening).
 */
const CITY_VISIT_USERNAME = /^[a-zA-Z0-9_]{3,30}$/;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      username?: unknown;
      path?: unknown;
    };
    const username = typeof body.username === "string" ? body.username : "";
    const path = typeof body.path === "string" ? body.path.slice(0, 128) : null;
    if (username && CITY_VISIT_USERNAME.test(username)) {
      await recordCityVisit(username, path);
    }
  } catch {
    /* never let analytics errors escape */
  }
  return new NextResponse(null, { status: 204 });
}
