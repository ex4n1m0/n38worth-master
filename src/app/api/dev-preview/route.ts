import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Owner-side bypass for the Windows-only gate (src/proxy.ts): visiting this
// route once plants a 30-day `n38-web-preview` cookie so the game UI stays
// reachable from a normal browser for production checks. This is a courtesy
// bypass, not a security boundary — the gate exists to retire the public web
// version, not to protect secrets (all real auth still applies).
export async function GET(req: NextRequest) {
  const next = req.nextUrl.searchParams.get("next");
  const target =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const res = NextResponse.redirect(new URL(target, req.url));
  res.cookies.set("n38-web-preview", "1", {
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
