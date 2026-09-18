/**
 * Public "market" Pusher channel — near-instant cross-player updates
 * without extra API invocations.
 *
 * Problem it solves: each client only subscribes to its own private
 * `player-{id}` channel, so changes OTHER players make (hires, overclocks,
 * discards) reach you only via the deliberately-slow polls (2.5–10 min).
 *
 * How: every market-mutating server action broadcasts a tiny patch on the
 * public `market` channel. Clients patch their cached react-query data in
 * place (zero refetches). Bulk actions broadcast `refresh: true` and clients
 * invalidate their market queries through a per-client throttle.
 *
 * Cost: one extra Pusher message per action (fan-out within a channel is a
 * single billed message); zero additional Vercel function invocations.
 *
 * Client-safe module: types + constants only. Server helpers live in
 * src/lib/market-broadcast.ts.
 */

export const MARKET_CHANNEL = "market";
export const MARKET_EVENT_NAME = "market-changed";

/** Per-player change to "how many cards this player owns". */
export interface MarketOwnedDelta {
  id: number;
  delta: number;
}

export interface MarketPatch {
  /** users.id of the changed card (0 for pure refresh broadcasts). */
  targetId: number;
  /** Username of the changed card (debugging aid / fallback matching). */
  username?: string;
  /** Absolute new playerValue, when the action changed it. */
  value?: number;
  /**
   * Absolute new owner count. The schema allows at most one owner per card
   * (UNIQUE index on ownership.owned_id), so this is always 0 or 1.
   */
  ownerCount?: number;
  /** Add N to the card's Score (photoScore). Omit/0 when not applicable. */
  photoScoreDelta?: number;
  /** Owned-count deltas for related players (buyer +1, poached-from −1). */
  ownedDeltas?: MarketOwnedDelta[];
  /** Bulk changes (combo sale, botnet, reset…): clients do a throttled refetch. */
  refresh?: boolean;
  /** Action name for debugging. */
  reason?: string;
}
