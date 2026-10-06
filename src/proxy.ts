import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { auth } from "@/lib/auth";
import { verifyDesktopToken } from "@/lib/desktop-token";

// Protected game routes that require authentication
const PROTECTED_ROUTES = [
  "/dashboard",
  "/players",
  "/player",
  "/leaderboard",
  "/settings",
  "/my-profile",
  "/my-players",
  "/my-owners",
  "/ranks",
  "/history",
  "/transactions",
  "/city",
  "/catalog",
  "/raid",
];

// Routes that require a completed avatar (profile photo uploaded)
const AVATAR_REQUIRED_ROUTES = [
  "/leaderboard",
  "/players",
  "/player",
  "/my-players",
  "/my-owners",
  "/ranks",
  "/history",
  "/transactions",
];

const DESKTOP_SESSION_TTL_S = 60 * 60 * 24 * 30; // mirror desktop-token.ts

/**
 * CORS for the bundled Windows client (tauri.localhost origin). The desktop
 * client authenticates with a Bearer token (never cookies), so a wildcard
 * origin is safe: same-origin web requests ignore CORS headers entirely.
 */
function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(corsHeaders())) res.headers.set(k, v);
  return res;
}

/**
 * Exchange a desktop Bearer token (src/lib/desktop-token.ts) for a NextAuth
 * session cookie on the REQUEST — downstream auth() in every route then
 * works unchanged, including the 60s DB re-verify in the jwt callback.
 * Both cookie spellings are injected: auth() resolves the __Secure- variant
 * on HTTPS and the plain one locally (the salt differs per name, so each
 * value is encoded with its own salt).
 */
async function injectDesktopSession(req: NextRequest, user: { id: string; name: string }) {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) return;
  const token = {
    id: user.id,
    name: user.name,
    lastVerified: Date.now(),
  };
  const plain = await encode({
    token,
    secret,
    salt: "authjs.session-token",
    maxAge: DESKTOP_SESSION_TTL_S,
  });
  const secure = await encode({
    token,
    secret,
    salt: "__Secure-authjs.session-token",
    maxAge: DESKTOP_SESSION_TTL_S,
  });
  req.cookies.set("authjs.session-token", plain);
  req.cookies.set("__Secure-authjs.session-token", secure);
}

const authMiddleware = auth((req) => {
  const isLoggedIn = !!req.auth?.user?.id;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const pathname = req.nextUrl.pathname;

  // Redirect logged-in users away from auth pages to the market
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/leaderboard", req.url));
  }

  // Protect game pages - redirect to login if not authenticated
  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Enforce avatar requirement — redirect to profile setup if no avatar
  if (isLoggedIn) {
    const avatarCompleted = req.auth?.user?.avatarCompleted === true;
    const ownUsername = req.auth?.user?.name;

    const isAvatarRequiredRoute = AVATAR_REQUIRED_ROUTES.some(
      (route) => pathname === route || pathname.startsWith(route + "/")
    );

    // Always allow a user to reach their OWN profile page — that's where the
    // avatar upload lives, so blocking it would create an infinite redirect
    // loop with /my-profile (which redirects there). Covers both the legacy
    // path form (/players/<me>) and the desktop query form (/player?u=me).
    const isOwnProfile =
      (!!ownUsername && pathname === `/players/${ownUsername}`) ||
      (!!ownUsername &&
        pathname === "/player" &&
        req.nextUrl.searchParams.get("u") === ownUsername);

    if (isAvatarRequiredRoute && !avatarCompleted && !isOwnProfile) {
      return NextResponse.redirect(new URL("/my-profile", req.url));
    }
  }

  return NextResponse.next();
}) as unknown as (req: NextRequest, event: NextFetchEvent) => Promise<NextResponse>;

// Windows-only gate (2026-10-06 ruling: web + Android retired). In
// production, every page request that does not come from the desktop
// client (UA token `n38worth-windows`, set in desktop/src-tauri/
// tauri.conf.json) is redirected to the /windows-only notice. Bypasses:
// /api/* (handled below), /privacy + /terms (never matched), the
// n38-web-preview cookie (owner browser checks — planted by
// /api/dev-preview), and non-production (local `next dev`).
// Kill switch: set WINDOWS_ONLY=false in the environment.
function windowsOnlyGate(req: NextRequest): NextResponse | null {
  const windowsOnly =
    process.env.NODE_ENV === "production" &&
    process.env.WINDOWS_ONLY !== "false";
  if (!windowsOnly) return null;
  const ua = req.headers.get("user-agent") ?? "";
  const isDesktopClient = ua.includes("n38worth-windows");
  const hasPreviewCookie = req.cookies.get("n38-web-preview")?.value === "1";
  if (!isDesktopClient && !hasPreviewCookie) {
    return NextResponse.redirect(new URL("/windows-only", req.url));
  }
  return null;
}

export default async function middleware(req: NextRequest, event: NextFetchEvent) {
  const pathname = req.nextUrl.pathname;
  const isApiRoute = pathname.startsWith("/api");

  // API requests: CORS + desktop Bearer translation. These skip the auth()
  // wrapper entirely (routes do their own auth()) — this keeps the API path
  // as cheap as the pre-2026-10-06 narrowed matcher, adding only this
  // function's own work.
  if (isApiRoute) {
    if (req.method === "OPTIONS") {
      return withCors(new NextResponse(null, { status: 204 }));
    }
    const authorization = req.headers.get("authorization");
    if (authorization) {
      const user = await verifyDesktopToken(authorization);
      if (user) {
        await injectDesktopSession(req, user);
      }
    }
    return withCors(NextResponse.next({ request: { headers: req.headers } }));
  }

  const gated = windowsOnlyGate(req);
  if (gated) return gated;

  return authMiddleware(req, event);
}

export const config = {
  // Pages listed run the auth()/avatar checks as before. /api/* runs only
  // the cheap CORS + Bearer branch above (no NextAuth decode here — each
  // route's own auth() remains the single session resolver for APIs).
  matcher: [
    "/",
    "/dashboard/:path*",
    "/players/:path*",
    "/leaderboard/:path*",
    "/settings/:path*",
    "/my-profile",
    "/my-players/:path*",
    "/my-owners/:path*",
    "/ranks/:path*",
    "/history/:path*",
    "/transactions/:path*",
    "/city/:path*",
    "/player/:path*",
    "/catalog/:path*",
    "/raid/:path*",
    "/login/:path*",
    "/register/:path*",
    "/chat/:path*",
    "/api/:path*",
  ],
};
