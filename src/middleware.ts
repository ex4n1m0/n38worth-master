import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // A user is truly logged in only if they have an auth session AND a valid user ID.
  // When a user's account is deleted from the DB, the JWT callback invalidates the token
  // by clearing the ID, so we must check for a non-empty user ID.
  const isLoggedIn = !!req.auth?.user?.id;
  const isAuthPage =
    req.nextUrl.pathname.startsWith("/login") ||
    req.nextUrl.pathname.startsWith("/register");
  const isGamePage =
    req.nextUrl.pathname.startsWith("/dashboard") ||
    req.nextUrl.pathname.startsWith("/players") ||
    req.nextUrl.pathname.startsWith("/leaderboard") ||
    req.nextUrl.pathname.startsWith("/settings");
  const isApiRoute = req.nextUrl.pathname.startsWith("/api");

  // Redirect logged-in users away from auth pages
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/leaderboard", req.url));
  }

  // Allow API routes and public pages
  if (isApiRoute || req.nextUrl.pathname === "/") {
    return NextResponse.next();
  }

  // Protect game pages - redirect to login if not authenticated
  if (isGamePage && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
