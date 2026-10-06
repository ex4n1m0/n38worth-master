import { SignJWT, jwtVerify } from "jose";

/**
 * Desktop-client session tokens (2026-10-06, PC_WINDOWS_PORT_STUDY wave 2).
 *
 * The bundled Windows client serves the UI locally (tauri.localhost origin)
 * and cannot use NextAuth's session cookie cross-origin, so it authenticates
 * with a Bearer token instead:
 *
 *   POST /api/client-session {username, password}  →  { token, user }
 *   Authorization: Bearer <token>                   →  all /api/* routes
 *
 * src/proxy.ts verifies this token on every /api request and injects an
 * equivalent NextAuth session cookie into the request, so every route's
 * auth() keeps working unchanged. Claims mirror the NextAuth JWT callback's
 * (id + name); the 60s DB re-verify still runs inside auth() as always.
 *
 * HS256 with the same secret NextAuth uses. Edge-runtime safe (jose).
 */

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const DESKTOP_TOKEN_PREFIX = "n38w_";

function getSecret(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Missing NEXTAUTH_SECRET/AUTH_SECRET");
  return new TextEncoder().encode(secret);
}

export async function mintDesktopToken(user: {
  id: string;
  name: string;
}): Promise<string> {
  const jwt = await new SignJWT({ name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
  return DESKTOP_TOKEN_PREFIX + jwt;
}

/** Returns the user claims ({id, name}) for a valid desktop token, else null. */
export async function verifyDesktopToken(
  authorization: string | null
): Promise<{ id: string; name: string } | null> {
  if (!authorization?.startsWith("Bearer " + DESKTOP_TOKEN_PREFIX)) return null;
  const jwt = authorization.slice("Bearer ".length + DESKTOP_TOKEN_PREFIX.length);
  try {
    const { payload } = await jwtVerify(jwt, getSecret());
    if (!payload.sub || typeof payload.name !== "string") return null;
    return { id: payload.sub, name: payload.name };
  } catch {
    return null;
  }
}
