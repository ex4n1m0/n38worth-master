/**
 * Server-side helpers for the self-hosted acquisition analytics
 * (analytics_events table — see drizzle/0022_add_analytics_events.sql).
 *
 * Every helper swallows its own errors: analytics must never break a
 * signup or a page load.
 */

import { cookies } from "next/headers";
import { db } from "@/db";
import { analyticsEvents } from "@/db/schema";
import { cleanUtmValue, utmCookieName, UTM_FIELDS, type UtmField } from "@/lib/utm";

export type AnalyticsEvent = {
  type: "visit" | "signup";
  path?: string | null;
  referrerDomain?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  username?: string | null;
};

async function insertEvent(event: AnalyticsEvent): Promise<void> {
  try {
    await db.insert(analyticsEvents).values(event);
  } catch (e) {
    console.error("Analytics insert failed (non-fatal):", e);
  }
}

/** Hostname of a referrer URL, or null for direct/invalid referrers. */
export function referrerDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return cleanUtmValue(new URL(referrer).hostname);
  } catch {
    return null;
  }
}

/** UTM values captured client-side (src/lib/utm.ts), read from the cookie jar. */
export async function utmFromCookies(): Promise<Partial<Record<UtmField, string>>> {
  try {
    const jar = await cookies();
    const values: Partial<Record<UtmField, string>> = {};
    for (const field of UTM_FIELDS) {
      const raw = jar.get(utmCookieName(field))?.value;
      const cleaned = cleanUtmValue(raw ? decodeURIComponent(raw) : null);
      if (cleaned) values[field] = cleaned;
    }
    return values;
  } catch {
    return {};
  }
}

/** Record a landing-page visit (called from /api/analytics/visit). */
export async function recordVisit(path: string, referrer: string | null): Promise<void> {
  await insertEvent({
    type: "visit",
    path: path ? path.slice(0, 128) : null,
    referrerDomain: referrerDomain(referrer),
    ...(await utmFromCookies()),
  });
}

/**
 * Record that `username` was created, attributed to the UTM channel the
 * player first arrived through. Call at every user-creation site AFTER the
 * insert succeeds: register, demo-register, quickplay, and the OAuth
 * first-sign-in paths in src/lib/auth.ts.
 */
export async function recordSignup(username: string): Promise<void> {
  await insertEvent({
    type: "signup",
    username: username.slice(0, 64),
    ...(await utmFromCookies()),
  });
}
