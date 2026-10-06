/**
 * Windows desktop client plumbing (PC_WINDOWS_PORT_STUDY wave 2, 2026-10-06).
 *
 * In the bundled exe the UI is served from the local Tauri origin while all
 * game data still comes from https://n38worth.com — so every relative /api/*
 * request must be rewritten to the absolute API base and carry the desktop
 * Bearer token (see /api/client-session + src/proxy.ts server side).
 *
 * Web builds (Vercel) keep API_BASE = "" and never install the shim: this
 * module is a no-op everywhere except the exe.
 */

export const DESKTOP_UA_TOKEN = "n38worth-windows";

// Baked at build time by scripts/build-desktop-client.mjs; empty on web.
export const API_BASE: string = process.env.NEXT_PUBLIC_API_BASE || "";

export function isDesktopClient(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(DESKTOP_UA_TOKEN);
}

const TOKEN_KEY = "n38-desktop-token";

export function getDesktopToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setDesktopToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearDesktopToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Absolute URL for API paths (img src use); non-/api paths pass through. */
export function absoluteApiUrl(path: string): string {
  if (!path.startsWith("/api")) return path;
  return API_BASE + path;
}

let fetchInstalled = false;

/**
 * Patch window.fetch ONCE in desktop mode: relative /api/* requests go to
 * the remote API with the Bearer token. Local assets (_next, /sounds, page
 * navigations) stay relative and are served from the bundle.
 */
export function installDesktopFetch(): void {
  if (fetchInstalled || typeof window === "undefined" || !isDesktopClient()) return;
  fetchInstalled = true;
  const original = window.fetch.bind(window);

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!url.startsWith("/api")) {
      return original(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const token = getDesktopToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const absolute = new URL(API_BASE + url, window.location.origin).toString();
    return original(absolute, {
      ...init,
      headers,
      mode: "cors",
      credentials: "omit",
    });
  }) as typeof window.fetch;
}
