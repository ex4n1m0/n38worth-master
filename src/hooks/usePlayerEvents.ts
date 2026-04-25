"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPusherClient } from "@/lib/pusher-client";
import { toast } from "sonner";
import { useSound } from "@/hooks/useSound";

export function usePlayerEvents(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { play } = useSound();

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
      play("hire");
      toast.success(`You earned ${data.amount} credits! ${data.buyer} hired ${data.fromPlayer} 🎉`);
    });

    channel.bind("ownership-changed", (data: { type: string; initiator: string }) => {
      queryClient.invalidateQueries({ queryKey: ["player"] });
      queryClient.invalidateQueries({ queryKey: ["ownership"] });
      if (data.type === "discard") {
        toast.info(`${data.initiator} discarded their relationship with you`);
      }
    });

    channel.bind("portfolio-reward", (data: { amount: number; portfolioValue: number }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      play("hire");
      toast.success(`You earned ${data.amount} credits from your portfolio reward! 💼`);
    });

    channel.bind("rank-bonus", (data: { amount: number; category: string; rank: string; position: number }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      play("hire");
      const positionLabels = ["1st", "2nd", "3rd"];
      const positionLabel = positionLabels[data.position - 1] || `${data.position}th`;
      toast.success(`You earned ${data.amount} credits! You're ${positionLabel} in ${data.category} rank (${data.rank}) 🏆`);
    });

    // Multi-account warnings disabled
    // channel.bind("multi-account-warning", (data: { message: string }) => {
    //   queryClient.invalidateQueries({ queryKey: ["credits"] });
    //   toast.warning("⚠️ Multi-Account Warning", {
    //     description: data.message,
    //     duration: 30000,
    //   });
    // });

    // channel.bind("multi-account-penalty", (data: { message: string }) => {
    //   queryClient.invalidateQueries({ queryKey: ["credits"] });
    //   queryClient.invalidateQueries({ queryKey: ["player"] });
    //   toast.error("🚫 Multi-Account Penalty", {
    //     description: data.message,
    //     duration: 30000,
    //   });
    // });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`player-${userId}`);
    };
  }, [userId, queryClient, play]);
}
