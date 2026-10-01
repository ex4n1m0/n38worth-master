"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPusherClient } from "@/lib/pusher-client";
import { toast } from "@/lib/event-feed";
import { useSound } from "@/hooks/useSound";
import { usePoachStore } from "@/hooks/usePoachEffect";
import { useLanguage } from "@/components/LanguageContext";
import { rankTitle } from "@/lib/ranks";

export function usePlayerEvents(userId: string | undefined) {
  const queryClient = useQueryClient();
  const { play } = useSound();
  const { t, locale } = useLanguage();

  useEffect(() => {
    if (!userId) return;

    const pusher = getPusherClient();
    if (!pusher) return; // Pusher not configured, skip real-time events

    const channelName = `player-${userId}`;
    console.log(`[poach] subscribing to ${channelName} (pusher state: ${pusher.connection.state})`);
    const channel = pusher.subscribe(channelName);
    channel.bind("pusher:subscription_succeeded", () => {
      console.log(`[poach] subscribed to ${channelName}`);
    });
    channel.bind("pusher:subscription_error", (status: unknown) => {
      console.error(`[poach] subscription error on ${channelName}:`, status);
    });

    channel.bind(
      "purchased",
      (data: {
        buyerUsername: string;
        newValue: number;
        amount?: number;
        buyerAvatar?: string | null;
      }) => {
        queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["players"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["player-value"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
        play("bought");
        // You were hired by someone — flash the same effect that fires when one
        // of your owned cards is poached, so being bought is just as visible.
        if (data.amount && data.amount > 0) {
          usePoachStore.getState().trigger({
            amount: data.amount,
            player: "you",
            playerAvatar: data.buyerAvatar ?? null,
            buyer: data.buyerUsername,
          });
        }
        toast.success(
          t.eventBoughtYou
            .replace("{buyer}", data.buyerUsername)
            .replace("{value}", String(data.newValue))
        );
      }
    );

    channel.bind("credits-updated", () => {
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" });
    });

    channel.bind(
      "revenue-received",
      (data: {
        amount: number;
        fromPlayer: string;
        fromPlayerAvatar?: string | null;
        buyer: string;
      }) => {
        console.log("[poach] revenue-received", data);
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["boss-income-estimate"], refetchType: "active" });
        play("poach");
        // Eye-catching "POACHED!" flash + navbar poach feed + credits bump.
        // (No toast — the sticky poach feed row in the Navbar is the
        // persistent confirmation.)
        usePoachStore.getState().trigger({
          amount: data.amount,
          player: data.fromPlayer,
          playerAvatar: data.fromPlayerAvatar ?? null,
          buyer: data.buyer,
        });
      }
    );

    channel.bind("ownership-changed", (data: { type: string; initiator: string }) => {
      queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["ownership"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["missions"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["ownership-limit"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["boss-income-estimate"], refetchType: "active" });
      // Mainframe City: hires/losses construct/remove buildings live.
      queryClient.invalidateQueries({ queryKey: ["city"], refetchType: "active" });
      if (data.type === "discard") {
        play("sell");
        toast.info(t.eventDiscardedYou.replace("{initiator}", data.initiator));
      }
    });

    channel.bind("portfolio-reward", (data: { amount: number; portfolioValue: number }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      play("reward");
      toast.success(
        t.eventPortfolioReward.replace("{amount}", String(data.amount))
      );
    });

    channel.bind("rank-bonus", (data: { amount: number; category: string; rank: string; position: number }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["rankPositions"], refetchType: "active" });
      play("reward");
      const positionLabels = [t.rankPos1, t.rankPos2, t.rankPos3];
      const positionLabel =
        positionLabels[data.position - 1] ||
        t.rankPosN.replace("{n}", String(data.position));
      // Raw category keys ("empire"/"credits"/"value"/"portfolio") map to their
      // display names ("Grid" etc. per the sci-fi rebrand).
      const categoryLabels: Record<string, string> = {
        empire: t.categoryGrid,
        credits: t.categoryCredits,
        value: t.categoryValue,
        portfolio: t.categoryPortfolio,
      };
      const categoryLabel = categoryLabels[data.category] ?? data.category;
      toast.success(
        t.eventRankBonus
          .replace("{amount}", String(data.amount))
          .replace("{position}", positionLabel)
          .replace("{category}", categoryLabel)
          .replace("{rank}", rankTitle(data.rank, locale))
      );
    });

    channel.bind(
      "boss-tax",
      (data: { amount: number; fromPlayer?: string; toBoss?: string; type: string; reason?: string }) => {
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["boss-income-estimate"], refetchType: "active" });
        play("coin");
        if (data.amount >= 0) {
          toast.success(
            t.eventBossTaxCollected
              .replace("{amount}", String(data.amount))
              .replace("{player}", String(data.fromPlayer))
          );
        } else {
          toast.info(
            t.eventBossTaxPaid
              .replace("{amount}", String(-data.amount))
              .replace("{boss}", String(data.toBoss))
          );
        }
      }
    );

    channel.bind("multi-account-warning", (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      toast.warning(t.multiAccountWarningTitle, {
        description: data.message,
        duration: 30000,
      });
    });

    channel.bind("multi-account-penalty", (data: { message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["player"], refetchType: "active" });
      play("error");
      toast.error(t.multiAccountPenaltyTitle, {
        description: data.message,
        duration: 30000,
      });
    });

    // ── Heist layer (vault raids + bounties, 2026-10-01) ──

    channel.bind(
      "raid-resolved",
      (data: { targetUsername: string; loot: number; locksCracked: number }) => {
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["raid-state"], refetchType: "active" });
        play("reward");
        toast.success(
          t.eventRaidResolved
            .replace("{loot}", String(data.loot))
            .replace("{target}", data.targetUsername)
        );
      }
    );

    channel.bind(
      "raid-suffered",
      (data: { attackerUsername: string; amount: number }) => {
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["raid-state"], refetchType: "active" });
        play("error");
        toast.warning(
          t.eventRaidSuffered
            .replace("{attacker}", data.attackerUsername)
            .replace("{amount}", String(data.amount))
        );
      }
    );

    channel.bind(
      "bounty-claimed",
      (data: { amount: number; targetUsername: string }) => {
        queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
        queryClient.invalidateQueries({ queryKey: ["bounties"], refetchType: "active" });
        play("reward");
        toast.success(
          t.eventBountyClaimed
            .replace("{amount}", String(data.amount))
            .replace("{target}", data.targetUsername)
        );
      }
    );

    channel.bind(
      "bounty-completed",
      (data: { takerUsername: string; targetUsername: string }) => {
        queryClient.invalidateQueries({ queryKey: ["bounties"], refetchType: "active" });
        play("coin");
        toast.info(
          t.eventBountyCompleted
            .replace("{target}", data.targetUsername)
            .replace("{taker}", data.takerUsername)
        );
      }
    );

    channel.bind("bounty-update", (data: { status: string; refunded?: number }) => {
      queryClient.invalidateQueries({ queryKey: ["credits"], refetchType: "active" });
      queryClient.invalidateQueries({ queryKey: ["bounties"], refetchType: "active" });
      if (data.status === "expired" && data.refunded) {
        toast.info(t.eventBountyRefund.replace("{amount}", String(data.refunded)));
      }
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`player-${userId}`);
    };
  }, [userId, queryClient, play, t, locale]);
}
