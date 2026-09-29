"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/event-feed";
import { Loader2, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlockCountdownBar } from "@/components/BlockCountdownBar";
import { cardDisplayName } from "@/lib/display-names";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useCredits } from "@/hooks/useCredits";
import { useSound } from "@/hooks/useSound";
import { formatCompact } from "@/lib/utils";
import { useLanguage } from "./LanguageContext";

interface MarketActionButtonProps {
  id: number;
  username: string;
  playerValue: number;
  blockSellUntil?: string | Date | null;
  /** Hide entirely when viewing your own profile (can't hire yourself). */
  isSelf?: boolean;
  className?: string;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * The market GET / PUMP action, reusable outside the card grid (e.g. a player's
 * profile header). Shows GET when unowned, PUMP once acquired, and a sell-block
 * countdown + progress bar when the player is currently blocked — mirroring the
 * marketplace Avatar.
 */
export function MarketActionButton({
  id,
  username,
  playerValue,
  blockSellUntil,
  isSelf = false,
  className = "",
}: MarketActionButtonProps) {
  const queryClient = useQueryClient();
  const { ownedIds } = useOwnedPlayerIds();
  const { data: myCredits } = useCredits();
  const { play } = useSound();
  const { t, locale } = useLanguage();

  const isOwned = ownedIds.has(id);
  const isBlocked = blockSellUntil ? new Date(blockSellUntil) > new Date() : false;
  const canAfford = (myCredits ?? 0) >= playerValue;

  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!isBlocked || !blockSellUntil) return;
    const end = new Date(blockSellUntil).getTime();
    const tick = () => setRemaining(Math.max(0, end - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [isBlocked, blockSellUntil]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["credits"] }),
      queryClient.invalidateQueries({ queryKey: ["player"] }),
      queryClient.invalidateQueries({ queryKey: ["players"] }),
      queryClient.invalidateQueries({ queryKey: ["ownership"] }),
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      queryClient.invalidateQueries({ queryKey: ["missions"] }),
      queryClient.invalidateQueries({ queryKey: ["ownership-limit"] }),
      // Overclock doubles the card's value → its building tier bumps.
      // The city query is what redraws it for the owner.
      queryClient.invalidateQueries({ queryKey: ["city"], refetchType: "active" }),
    ]);

  const buyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.purchaseFailed);
      return data;
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      toast.success(t.purchaseToast
        .replace("{name}", username)
        .replace("{value}", formatCompact(data.newValue)));
      await refresh();
    },
  });

  const pumpMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/pump", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.overclockFailed);
      return data;
    },
    onError: (err: Error) => {
      play("error");
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      toast.success(t.overclockToast
        .replace("{name}", cardDisplayName(username, locale))
        .replace("{value}", formatCompact(data.newValue)));
      await refresh();
    },
  });

  if (isSelf) return null;

  return (
    <div className={`flex flex-col items-stretch gap-1.5 ${className}`}>
      {isOwned ? (
        <Button
          onClick={() => {
            play("confirm");
            pumpMutation.mutate();
          }}
          disabled={!canAfford || pumpMutation.isPending}
          className={`rounded-md flex flex-col items-center justify-center gap-0.5 font-bold py-2 h-auto min-h-[2.75rem] ${
            canAfford
              ? "text-white bg-transparent border-2 border-fuchsia-500 hover:bg-fuchsia-500/15 shadow-lg shadow-purple-900/30"
              : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {pumpMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span className="text-base leading-none">{t.landChipOverclock}</span>
              <span className="text-xs">{formatCompact(playerValue)}¢</span>
            </>
          )}
        </Button>
      ) : !isBlocked ? (
        <Button
          onClick={() => {
            play("hire");
            buyMutation.mutate();
          }}
          disabled={!canAfford || buyMutation.isPending}
          className={`rounded-md flex flex-col items-center justify-center gap-0.5 font-bold py-2 h-auto min-h-[2.75rem] ${
            canAfford
              ? "text-white bg-transparent border-2 border-green-500 hover:bg-green-500/15 shadow-lg shadow-green-900/30"
              : "bg-transparent border-2 border-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {buyMutation.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span className="text-base leading-none">{t.landChipGet}</span>
              <span className="text-xs">{formatCompact(playerValue)}¢</span>
            </>
          )}
        </Button>
      ) : null}

      {/* Sell/hire block countdown — mirrors the marketplace Avatar. */}
      {isBlocked && blockSellUntil && (
        <div className="flex flex-col items-center gap-1 rounded-md bg-amber-950/50 border border-amber-500/30 py-1.5 px-2">
          <span className="flex items-center gap-1 text-xs font-bold text-amber-400 leading-none tabular-nums">
            <Shield className="h-3.5 w-3.5" />
            {formatCountdown(remaining)}
          </span>
          <BlockCountdownBar blockSellUntil={blockSellUntil} className="w-[85%]" />
        </div>
      )}
    </div>
  );
}
