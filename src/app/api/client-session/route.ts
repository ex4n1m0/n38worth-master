import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { mintDesktopToken } from "@/lib/desktop-token";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Credentials login for the bundled Windows client (wave 2). Returns a
 * Bearer token (src/lib/desktop-token.ts) that the desktop fetch shim sends
 * on every API call; src/proxy.ts exchanges it for a NextAuth session
 * cookie server-side. Username/password semantics are identical to the
 * NextAuth credentials provider (bcrypt; demo accounts log in with
 * password "demo").
 *
 * GET returns the caller's current session (Bearer or cookie) so the client
 * can bootstrap its session state on launch.
 */
export async function POST(req: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "username and password required" },
      { status: 400 }
    );
  }

  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (!user.passwordHash) {
    if (password !== "demo") {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
  } else {
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
  }

  const token = await mintDesktopToken({
    id: user.id.toString(),
    name: user.username,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id.toString(),
      name: user.username,
      avatarCompleted: user.avatarCompleted === 1 && !!user.avatarUrl,
    },
  });
}

export async function GET(req: NextRequest) {
  // Prefer an explicit Bearer token; fall back to the cookie session (the
  // remote-loaded exe still uses cookies).
  const bearerUser = await import("@/lib/desktop-token").then((m) =>
    m.verifyDesktopToken(req.headers.get("authorization"))
  );
  if (bearerUser) {
    return NextResponse.json({ user: bearerUser });
  }
  const session = await auth();
  if (session?.user?.id) {
    return NextResponse.json({
      user: {
        id: session.user.id,
        name: session.user.name,
        avatarCompleted: session.user.avatarCompleted === true,
      },
    });
  }
  return NextResponse.json({ user: null });
}
