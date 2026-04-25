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
  "/chat",
  "/transactions",
];

// Routes that should be blocked during onboarding (only accessible after avatar completion)
const AVATAR_REQUIRED_ROUTES = ["/leaderboard", "/players"];

// Routes that should be blocked until onboarding is complete
const ONBOARDING_REQUIRED_ROUTES = [
  "/my-players",
  "/my-owners",
  "/ranks",
  "/history",
];

export default auth((req) => {
  const isLoggedIn = !!req.auth?.user?.id;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");
  const pathname = req.nextUrl.pathname;

  // Redirect logged-in users away from auth pages to their own profile
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/my-profile", req.url));
  }

  // Allow API routes and public pages
  if (isApiRoute || pathname === "/" || pathname.startsWith("/privacy") || pathname.startsWith("/terms")) {
    return NextResponse.next();
  }

  // Protect game pages - redirect to login if not authenticated
  const isProtectedRoute = PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
