"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPusherClient } from "@/lib/pusher-client";
import { toast } from "sonner";

export function usePlayerEvents(userId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured, skip real-time events

    const channel = pusher.subscribe(`player-${userId}`);

    channel.bind("purchased", (data: { buyerUsername: string; newValue: number }) => {
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["players"] });
      toast.success(`${data.buyerUsername} bought you! Your value is now ${data.newValue} 💰`);
    });

    channel.bind("credits-updated", () => {
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["player"] });
    });

    channel.bind("revenue-received", (data: { amount: number; fromPlayer: string; buyer: string }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      toast.success(`You earned ${data.amount} credits! ${data.buyer} bought ${data.fromPlayer} 🎉`);
    });

    channel.bind("ownership-changed", (data: { type: string; initiator: string }) => {
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      if (data.type === "discard") {
        toast.info(`${data.initiator} discarded their relationship with you`);
      }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`player-${userId}`);
    };
  }, [userId, queryClient]);
}
