import { recordVisit } from "@/lib/analytics";
import { NextResponse } from "next/server";

/**
 * Landing-page visit beacon (sent via navigator.sendBeacon from
 * src/lib/utm.ts). Unauthenticated by design — the payload is just a path
 * and a referrer, no PII — and it ALWAYS returns 204 so a failed analytics
 * write can never surface to the visitor. POST is never CDN-cached.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      path?: unknown;
      referrer?: unknown;
    };
    const path = typeof body.path === "string" ? body.path : "/";
    const referrer = typeof body.referrer === "string" ? body.referrer : null;
    await recordVisit(path, referrer);
  } catch {
    /* never let analytics errors escape */
  }
  return new NextResponse(null, { status: 204 });
}
