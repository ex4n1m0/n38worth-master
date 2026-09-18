/**
 * Server-side helpers for broadcasting market patches on the public
 * `market` Pusher channel. See src/lib/market-events.ts for the contract.
 *
 * Never throws into the calling action — a failed broadcast must not fail
 * a completed purchase/overclock/discard.
 */

import { pusher } from "@/lib/pusher-server";
import {
  MARKET_CHANNEL,
  MARKET_EVENT_NAME,
  type MarketPatch,
} from "@/lib/market-events";

export async function broadcastMarketPatch(patch: MarketPatch): Promise<void> {
  try {
    await pusher.trigger(MARKET_CHANNEL, MARKET_EVENT_NAME, patch);
  } catch (e) {
    console.error("Market broadcast failed (non-fatal):", e);
  }
}

/** Bulk variant: ask connected clients to refetch their market views. */
export async function broadcastMarketRefresh(reason: string): Promise<void> {
  await broadcastMarketPatch({ targetId: 0, refresh: true, reason });
}
