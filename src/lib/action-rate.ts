"use client";

import { toast } from "@/lib/event-feed";

/**
 * Soft UX for the universal 30-actions-per-minute ceiling
 * (PLAYER_AI_STUDY.md §7.5, ruling 2026-10-03): a player who trips it was
 * just clicking fast — show a gentle warning toast (NOT a red error, no
 * error sound) and abort the action handler via a typed error.
 *
 * Usage at each guarded-route fetch site:
 *   await throwIfRateLimited(res, t.rateLimitSlowDown);
 *   const data = await res.json();
 *   if (!res.ok) throw new Error(data.error || t.xxxFailed);
 * …and the catch/onError starts with:
 *   if (err instanceof RateLimitError) return;
 */
export class RateLimitError extends Error {
  constructor() {
    super("rate-limited");
    this.name = "RateLimitError";
  }
}

export async function throwIfRateLimited(res: Response, slowDownMessage: string): Promise<void> {
  if (res.status !== 429) return;
  toast.warning(slowDownMessage, { duration: 3000 });
  throw new RateLimitError();
}
