"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPusherClient } from "@/lib/pusher-client";
import {
  MARKET_CHANNEL,
  MARKET_EVENT_NAME,
  type MarketPatch,
} from "@/lib/market-events";

/**
 * Subscribe to the public `market` channel and keep cached market data
 * fresh when OTHER players act (the private `player-{id}` channel already
 * covers your own actions).
 *
 * - Single-card patches are applied directly to cached ["players"] /
 *   ["player"] query data via setQueriesData — no network, instant.
 * - `refresh: true` broadcasts invalidate those queries, throttled to one
 *   refetch per REFRESH_THROTTLE_MS per client so action bursts can't
 *   stampede the API. Only actively-mounted queries refetch.
 */

const REFRESH_THROTTLE_MS = 10_000;

// Cached query payloads are loosely typed (they come straight from API
// routes); the patcher returns the SAME reference when nothing matches, so
// react-query skips re-renders for unaffected entries.
/* eslint-disable @typescript-eslint/no-explicit-any */
function applyPatchToRow(row: any, patch: MarketPatch): any {
  if (!row || typeof row !== "object" || row.id === undefined) return row;

  const isTarget = row.id === patch.targetId;
  const ownedDelta = patch.ownedDeltas?.find((d) => d.id === row.id)?.delta;
  if (!isTarget && ownedDelta === undefined) return row;

  const next: any = { ...row };
  if (isTarget) {
    if (patch.value !== undefined) next.playerValue = patch.value;
    if (patch.ownerCount !== undefined) next.ownerCount = patch.ownerCount;
    if (patch.photoScoreDelta) {
      next.photoScore = Number(row.photoScore ?? 0) + patch.photoScoreDelta;
    }
  }
  if (ownedDelta !== undefined) {
    next.ownedCount = Number(row.ownedCount ?? 0) + ownedDelta;
  }
  return next;
}

export function useMarketEvents() {
  const queryClient = useQueryClient();
  const lastRefreshAt = useRef(0);

  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured — polls still cover updates

    const channel = pusher.subscribe(MARKET_CHANNEL);

    channel.bind(MARKET_EVENT_NAME, (patch: MarketPatch) => {
      if (!patch) return;

      if (patch.refresh) {
        const now = Date.now();
        if (now - lastRefreshAt.current < REFRESH_THROTTLE_MS) return;
        lastRefreshAt.current = now;
        queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" });
        return;
      }

      queryClient.setQueriesData({ queryKey: ["players"] }, (data: any) => {
        if (!data || typeof data !== "object" || !Array.isArray(data.players)) {
          // Not a market-list payload (e.g. an owned-ids array) — leave it.
          return data;
        }
        return {
          ...data,
          players: data.players.map((row: any) => applyPatchToRow(row, patch)),
        };
      });
      // Detail-page caches store the player object at the top level.
      queryClient.setQueriesData({ queryKey: ["player"] }, (data: any) =>
        applyPatchToRow(data, patch)
      );
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(MARKET_CHANNEL);
    };
  }, [queryClient]);
}
