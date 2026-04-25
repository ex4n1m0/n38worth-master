import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/lib/auth";

/**
 * Mobile-friendly OAuth entry point for the Capacitor Android app.
 *
 * Background: NextAuth v5 (Auth.js) requires a POST with a CSRF token to
 * `/api/auth/signin/[provider]` to start the OAuth flow — a plain GET returns
 * "Server error — Configuration". Opening a GET URL directly in the system
 * browser therefore breaks on the phone.
 *
 * This route handler uses Auth.js's built-in server-side `signIn()` which
 * bypasses CSRF (it's called directly on the server) and returns a redirect
 * to the provider's OAuth consent screen along with all the cookies Auth.js
 * needs (pkce, state, nonce).
 *
 * Usage: `GET /api/mobile-signin/google?callbackUrl=/my-profile`
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const callbackUrl = req.nextUrl.searchParams.get("callbackUrl") || "/my-profile";

  try {
    // signIn() with redirect:false returns the URL to redirect to (e.g. the
    // Google OAuth consent URL). It also sets pkce/state/nonce cookies on the
    // response. Because we're inside a route handler those cookies are part
    // of the outgoing response automatically.
    const url = await signIn(provider, {
      redirect: false,
      redirectTo: callbackUrl,
    });

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "signin_no_url", provider, received: url },
        { status: 500 }
      );
    }

    return NextResponse.redirect(url, 302);
  } catch (err) {
    const message =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    return NextResponse.json(
      { error: "signin_failed", provider, message },
      { status: 500 }
    );
  }
}
