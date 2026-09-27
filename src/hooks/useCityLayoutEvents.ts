"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPusherClient } from "@/lib/pusher-client";

/**
 * Realtime gap fix for the city layout (RTS plan §D5): the layout POST fires
 * a best-effort `city-layout-updated` event on the owner's private
 * `player-{id}` channel so OTHER devices/tabs refetch. Mirrors
 * useMarketEvents.ts structure.
 *
 * Binds ONLY the `city-layout-updated` event and unbinds that single
 * handler on cleanup — the private channel is shared with usePlayerEvents
 * (mounted in the game layout), so a blanket unbind_all() here would strip
 * its handlers.
 */
export function useCityLayoutEvents(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const pusher = getPusherClient();
    if (!pusher) return; // Pusher unconfigured — the 120s poll still covers it

    const channel = pusher.subscribe(`player-${userId}`);

    const onLayoutUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["city"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["city-layout"], refetchType: "active" });
    };
    channel.bind("city-layout-updated", onLayoutUpdated);

    return () => {
      // Unbind ONLY our handler — the private channel is shared with
      // usePlayerEvents (game layout) and pusher-js does not refcount
      // subscriptions, so unsubscribe here would kill its handlers.
      channel.unbind("city-layout-updated", onLayoutUpdated);
    };
  }, [userId, queryClient]);
}
