"use client";

import { useEffect, useRef } from "react";
import { getPusherClient } from "@/lib/pusher-client";
import { usePoachStore } from "@/hooks/usePoachEffect";
import { useSound } from "@/hooks/useSound";

const POLL_MS = 60000;
const MAX_BURST = 3; // cap simultaneous flashes to avoid flooding the screen

interface PoachRow {
  id: number;
  amount: number;
  buyer: string;
  player: string;
  createdAt: string;
}

/**
 * Polling fallback for the "POACHED!" steal effect.
 *
 * The primary path is the `revenue-received` Pusher event (see
 * `usePlayerEvents`). When Pusher is unconfigured or disconnected, this hook
 * polls `/api/me/recent-poaches` and fires the same effect, so the animation
 * still works without realtime.
 *
 * Dedupe strategy: it skips polling while Pusher is connected (the realtime
 * path owns the effect then), and tracks the last-seen reward-history id so it
 * never replays historical poaches on load.
 */
export function usePoachFallback(userId: string | undefined) {
  const { play } = useSound();
  const lastSeenIdRef = useRef<number>(0);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    const pendingTimers: ReturnType<typeof setTimeout>[] = [];
    const pusher = getPusherClient();

    const poll = async () => {
      // Never poll from hidden/background tabs — the effect is purely visual,
      // and idle open tabs would otherwise generate requests forever.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      // While Pusher is actively delivering, let the realtime path own the
      // effect to avoid firing it twice.
      if (pusher && pusher.connection.state === "connected") return;

      try {
        const res = await fetch(
          `/api/me/recent-poaches?sinceId=${lastSeenIdRef.current}`
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { poaches?: PoachRow[] };
        const rows = data.poaches ?? [];
        if (rows.length === 0) return;

        // Endpoint returns newest-first.
        const maxId = rows[0].id;

        // First successful fetch: prime the cursor without replaying history.
        if (!initializedRef.current) {
          initializedRef.current = true;
          lastSeenIdRef.current = maxId;
          return;
        }

        lastSeenIdRef.current = maxId;

        // Show oldest-first, staggered so multiple steals don't overlap.
        const fresh = [...rows].sort((a, b) => a.id - b.id).slice(-MAX_BURST);
        fresh.forEach((p, i) => {
          const timer = setTimeout(() => {
            if (cancelled) return;
            play("hire");
            // Navbar poach feed only — no toast (the sticky feed row is the
            // persistent confirmation).
            usePoachStore.getState().trigger({
              amount: p.amount,
              player: p.player,
              playerAvatar: null,
              buyer: p.buyer,
            });
          }, i * 2200);
          pendingTimers.push(timer);
        });
      } catch {
        // Network/transient error — retry on the next tick.
      }
    };

    // Prime immediately, then poll on an interval.
    poll();
    const intervalId = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      pendingTimers.forEach(clearTimeout);
    };
  }, [userId, play]);
}
