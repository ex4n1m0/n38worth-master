"use client";

/**
 * Session compatibility layer for the Windows desktop client (wave 2).
 *
 * The bundled exe cannot use next-auth/react's cookie session (local Tauri
 * origin), so in desktop mode this module provides the same useSession /
 * signIn / signOut surface backed by the desktop Bearer token
 * (src/lib/desktop-client.ts + /api/client-session). On the web it simply
 * delegates to next-auth/react — call sites swap their import and behave
 * identically in both builds.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSession as useNextAuthSession, signIn as nextSignIn, signOut as nextSignOut } from "next-auth/react";
import {
  clearDesktopToken,
  getDesktopToken,
  isDesktopClient,
  setDesktopToken,
} from "./desktop-client";

export interface CompatSessionUser {
  id?: string;
  name?: string | null;
  image?: string | null;
  avatarCompleted?: boolean;
}

export interface CompatSession {
  user?: CompatSessionUser;
}

export type CompatSessionStatus = "loading" | "authenticated" | "unauthenticated";

export interface SignInCredentials {
  username: string;
  password: string;
}

interface DesktopSessionValue {
  session: CompatSession | null;
  status: CompatSessionStatus;
  signIn: (creds: SignInCredentials) => Promise<{ error?: string } | null>;
  signOut: (options?: { callbackUrl?: string }) => Promise<void>;
  update: () => Promise<CompatSession | null>;
}

const DesktopSessionContext = createContext<DesktopSessionValue | null>(null);

export function DesktopSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CompatSession | null>(null);
  const [status, setStatus] = useState<CompatSessionStatus>(() =>
    getDesktopToken() ? "loading" : "unauthenticated"
  );

  useEffect(() => {
    let cancelled = false;
    const token = getDesktopToken();
    if (!token) return;
    fetch("/api/client-session")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data: { user?: CompatSessionUser | null }) => {
        if (cancelled) return;
        if (data.user?.id) {
          setSession({ user: data.user });
          setStatus("authenticated");
        } else {
          clearDesktopToken();
          setSession(null);
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (creds: SignInCredentials) => {
    const res = await fetch("/api/client-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(creds),
    });
    if (!res.ok) return { error: "CredentialsSignin" };
    const data = (await res.json()) as {
      token: string;
      user: CompatSessionUser;
    };
    setDesktopToken(data.token);
    setSession({ user: data.user });
    setStatus("authenticated");
    return null;
  }, []);

  const signOut = useCallback(async (options?: { callbackUrl?: string }) => {
    clearDesktopToken();
    setSession(null);
    setStatus("unauthenticated");
    if (options?.callbackUrl && typeof window !== "undefined") {
      window.location.href = options.callbackUrl;
    }
  }, []);

  // Re-read the session from the API (mirrors next-auth's session.update —
  // used after avatar uploads to refresh avatarCompleted). The data argument
  // is accepted for signature parity and ignored: the server session is the
  // source of truth.
  const update = useCallback(
    async (_data?: unknown): Promise<CompatSession | null> => {
    const token = getDesktopToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/client-session");
      const data = (await res.json()) as { user?: CompatSessionUser | null };
      if (data.user?.id) {
        setSession({ user: data.user });
        setStatus("authenticated");
        return { user: data.user };
      }
    } catch {
      // network hiccup — keep the current state
    }
    return session;
  }, [session]);

  const value = useMemo(
    () => ({ session, status, signIn, signOut, update }),
    [session, status, signIn, signOut, update]
  );

  return (
    <DesktopSessionContext.Provider value={value}>
      {children}
    </DesktopSessionContext.Provider>
  );
}

function useDesktopSession(): DesktopSessionValue | null {
  // Null on the web build (no DesktopSessionProvider mounted) — callers
  // branch on isDesktopClient() and never touch a null context in practice.
  return useContext(DesktopSessionContext);
}

/**
 * Drop-in for next-auth/react's useSession. Desktop: token-backed context.
 * Web: the real thing.
 */
export function useSessionCompat(): {
  data: CompatSession | null;
  status: CompatSessionStatus;
  update: (data?: unknown) => Promise<CompatSession | null>;
} {
  const desktop = isDesktopClient();
  const desktopSession = useDesktopSession();
  const webSession = useNextAuthSession();
  if (desktop) {
    if (!desktopSession) {
      return {
        data: null,
        status: "loading",
        update: async () => null,
      };
    }
    return {
      data: desktopSession.session,
      status: desktopSession.status,
      update: desktopSession.update,
    };
  }
  return {
    data: (webSession.data as CompatSession | null) ?? null,
    status: webSession.status,
    update: async () =>
      ((await webSession.update()) as CompatSession | null) ?? null,
  };
}

/** Drop-in for signIn("credentials", { username, password, redirect: false }). */
export async function signInCompat(
  provider: "credentials" | string,
  options?: {
    username?: string;
    password?: string;
    redirect?: boolean;
    callbackUrl?: string;
  }
): Promise<{ error?: string } | null> {
  if (provider !== "credentials") {
    // OAuth providers are web-only in wave 2 (the exe cannot complete the
    // browser redirect flow) — surface the standard error instead.
    return { error: "OAuthNotAvailable" };
  }
  if (isDesktopClient()) {
    // Direct token login; the page reload re-bootstraps DesktopSessionProvider
    // and every consumer from the fresh token.
    const res = await fetch("/api/client-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: options?.username,
        password: options?.password,
      }),
    });
    if (!res.ok) return { error: "CredentialsSignin" };
    const data = (await res.json()) as { token: string; user: CompatSessionUser };
    setDesktopToken(data.token);
    if (typeof window !== "undefined") {
      window.location.href = options?.callbackUrl || "/";
    }
    return null;
  }
  // Cast: next-auth's signIn overloads demand literal `redirect: true|false`;
  // web callers get their exact original behavior through this boundary.
  const result = (await (nextSignIn as unknown as (
    provider: string,
    options: Record<string, unknown>
  ) => Promise<{ error?: string } | null>)("credentials", {
    username: options?.username,
    password: options?.password,
    redirect: options?.redirect === true,
    callbackUrl: options?.callbackUrl,
  })) as { error?: string } | null;
  return result ? { error: result.error } : null;
}

/** Drop-in for signOut(). */
export async function signOutCompat(
  options?: { callbackUrl?: string }
): Promise<void> {
  if (isDesktopClient()) {
    clearDesktopToken();
    if (typeof window !== "undefined") {
      window.location.href = options?.callbackUrl || "/";
    }
    return;
  }
  await nextSignOut({ redirect: false });
}
