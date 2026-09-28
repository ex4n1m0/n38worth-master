import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Protected game routes that require authentication
const PROTECTED_ROUTES = [
  "/dashboard",
  "/players",
  "/leaderboard",
  "/settings",
  "/my-profile",
  "/my-players",
  "/my-owners",
  "/ranks",
  "/history",
  "/transactions",
  "/city",
];

// Routes that require a completed avatar (profile photo uploaded)
const AVATAR_REQUIRED_ROUTES = [
  "/leaderboard",
  "/players",
  "/my-players",
  "/my-owners",
  "/ranks",
  "/history",
  "/transactions",
];

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user?.id;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const pathname = req.nextUrl.pathname;

  // Redirect logged-in users away from auth pages to the market
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/leaderboard", req.url));
  }

  // Allow API routes and public pages
  if (isApiRoute || pathname === "/" || pathname.startsWith("/privacy") || pathname.startsWith("/terms")) {
    return NextResponse.next();
  }

  // Generated city building art (public/city/pixel) is a STATIC asset — the
  // canvas fetches it directly, so it must never hit the login wall.
  if (pathname.startsWith("/city/pixel/")) {
    return NextResponse.next();
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

    // Always allow a user to reach their OWN /players/<username> profile —
    // that's where the avatar upload lives, so blocking it would create an
    // infinite redirect loop with /my-profile (which redirects there).
    const isOwnProfile =
      !!ownUsername && pathname === `/players/${ownUsername}`;

    if (isAvatarRequiredRoute && !avatarCompleted && !isOwnProfile) {
      return NextResponse.redirect(new URL("/my-profile", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Only run auth middleware on pages that actually need protection/avatar
  // checks. Excluding /, /api/*, /privacy, /terms, and static assets keeps
  // public/landing traffic and every API call from invoking auth().
  matcher: [
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
    "/catalog/:path*",
    "/login",
    "/register",
  ],
};
