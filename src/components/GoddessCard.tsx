"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, User, ShoppingCart, Loader2, Shield, Lock, Clock, Power } from "lucide-react";
import Link from "next/link";
import { BlockCountdownBar } from "./BlockCountdownBar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { useMissionLevel, useFinalGoddessThreshold } from "@/hooks/useMissionLevel";
import { getAvatarSrc } from "@/lib/avatar-utils";
import { formatCompact, formatNumber } from "@/lib/utils";
import { GODDESS_POWERS } from "@/lib/goddesses";
import {
  isLockablePurchaseCard,
  isPurchaseUnlockedAtLevel,
  purchaseUnlockThreshold,
  FINAL_GODDESS_CARD,
} from "@/lib/missions-data";

interface GoddessCardProps {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  hireCost?: number;
  originalValue: number;
  ownerCount: number;
  ownedCount: number;
  ownerName?: string | null;
  ownerValue?: number | null;
  blockSellUntil?: string | null;
  currentUserId: number | null;
  powerDisabled?: boolean;
}

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Live partnership countdown — ticks down to the block end every second. */
function PartnershipCountdown({ blockSellUntil }: { blockSellUntil: string | Date }) {
  const endMs = new Date(blockSellUntil).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, endMs - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRemaining(Math.max(0, endMs - Date.now())), 1000);
    return () => clearInterval(id);
  }, [endMs]);
  return <>{formatCountdown(remaining)}</>;
}

function getGoddessEmoji(username: string): string {
  const emojis: Record<string, string> = {
    "Goddess of Wealth": "💰",
    "Goddess of Knowledge": "📚",
    "Goddess of Fate": "🎯",
    "Goddess of Time": "⏳",
    "Goddess of War": "⚔️",
    "Goddess": "👑",
  };
  return emojis[username] || "✨";
}


export function GoddessCard({
  id,
  username,
  avatarUrl,
  playerValue,
  originalValue,
  hireCost,
  ownerCount,
  ownedCount,
  ownerName,
  blockSellUntil,
  powerDisabled = false,
}: GoddessCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const { play } = useSound();
  const missionLevel = useMissionLevel();
  const finalGoddessThreshold = useFinalGoddessThreshold();

  // Locked until the player has obtained this goddess from its mission once.
  const locked =
    isLockablePurchaseCard(username) &&
    !isPurchaseUnlockedAtLevel(username, missionLevel);
  // The final Goddess threshold is dynamic (5,000 base +1,000 per game won).
  const unlockThreshold =
    username === FINAL_GODDESS_CARD && finalGoddessThreshold !== null
      ? finalGoddessThreshold
      : purchaseUnlockThreshold(username);

  // All goddesses: value = hire cost = floor = GODDESS_VALUES.
  // Use originalValue as the single source of truth for display and hire.
  const effectiveCost = originalValue;
  const isOwned = ownerCount > 0 && !!ownerName;
  const canAfford = (myCredits ?? 0) >= effectiveCost;
  const isOwnProfile = session?.user?.name === username;
  const goddessAvatarSrc = getAvatarSrc({
    avatarUrl,
    playerId: id,
    playerUsername: username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isGoddess: true, // Goddesses always show real avatars
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - effectiveCost : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _, context) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        toast.success(
          `You bought ${username}! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["goddesses"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        ]);
      }
    },
  });

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    mutation.mutate();
  };

  // Owners can extend their partnership by +10 min. Cost = the goddess's
  // current value, which is burned from the economy (not paid to anyone).
  // Ownership is derived authoritatively from the goddess's current owner name
  // (the `ownedIds` hook doesn't include goddesses, which made owners wrongly
  // see the hire button and hit "You already own this player").
  const isViewerOwner =
    !!session?.user?.name && !!ownerName && session.user.name === ownerName;
  const canAffordExtend = (myCredits ?? 0) >= effectiveCost;

  const extendMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/extend-partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to extend partnership");
      return data;
    },
    onSuccess: async (data) => {
      toast.success(`+10 min partnership on ${username}! (-${formatCompact(data.cost)}¢)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["credits"] }),
        queryClient.invalidateQueries({ queryKey: ["goddesses"] }),
        queryClient.invalidateQueries({ queryKey: ["players"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExtendClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("hire");
    extendMutation.mutate();
  };

  // Power toggle — owner can turn the goddess power on/off.
  const [powerOn, setPowerOn] = useState(!powerDisabled);
  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/toggle-goddess-power", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goddessName: username }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to toggle power");
      return data;
    },
    onMutate: () => {
      setPowerOn((prev) => !prev);
    },
    onSuccess: async (data) => {
      setPowerOn(!data.disabled);
      toast.success(
        data.disabled
          ? `${username} power turned OFF`
          : `${username} power turned ON`
      );
      await queryClient.invalidateQueries({ queryKey: ["goddesses"] });
    },
    onError: (err: Error) => {
      setPowerOn(!powerOn); // revert on error
      toast.error(err.message);
    },
  });

  const handleTogglePower = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    play("buttons");
    toggleMutation.mutate();
  };

  return (
    <Card className={`border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 transition-all duration-200 group overflow-hidden`}>
      <CardContent className="p-0">
        {/* Clean Avatar Section - No overlay */}
        <div className="aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={goddessAvatarSrc}
            alt={username}
            className="w-full h-full object-fill"
          />
        </div>
        
        {/* Info Section Below Avatar */}
        <div className="p-2 sm:p-4 space-y-2 sm:space-y-3">
          {/* Goddess Name with Emoji */}
          <div className="flex items-center gap-1.5">
            <span className="text-base sm:text-lg lg:text-xl shrink-0">{getGoddessEmoji(username)}</span>
            <h3 className="font-bold text-white text-xs sm:text-base lg:text-lg leading-tight break-words min-w-0">
              {username}
            </h3>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-1 gap-2">
            <div className="bg-gray-800/50 rounded-lg p-2">
              <p className="text-gray-400 text-xs">Owner</p>
              {isOwned ? (
                <Link 
                  href={`/players/${ownerName}`}
                  className="text-yellow-400 font-semibold text-sm truncate hover:text-yellow-300 transition-colors block"
                >
                  {ownerName}
                </Link>
              ) : (
                <p className="text-green-400 font-semibold text-[10px] sm:text-sm">Available</p>
              )}
            </div>
          </div>

          {/* Power description */}
          {GODDESS_POWERS[username] && (
            <div className={`rounded-lg p-2.5 border ${
              isViewerOwner && !powerOn
                ? "bg-gray-800/30 border-gray-700/30 opacity-60"
                : "bg-purple-900/20 border-purple-500/20"
            }`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-purple-300 text-[10px] font-semibold uppercase tracking-wider">Power</p>
                {isViewerOwner && (
                  <button
                    onClick={handleTogglePower}
                    disabled={toggleMutation.isPending}
                    className={`flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full transition-all ${
                      powerOn
                        ? "bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30"
                        : "bg-gray-700/50 text-gray-400 border border-gray-600/30 hover:bg-gray-700/80"
                    }`}
                    title={powerOn ? "Power is ON — click to disable" : "Power is OFF — click to enable"}
                  >
                    {toggleMutation.isPending ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Power className="h-2.5 w-2.5" />
                    )}
                    {powerOn ? "ON" : "OFF"}
                  </button>
                )}
              </div>
              <p className="text-gray-300 text-xs leading-snug">{GODDESS_POWERS[username]}</p>
            </div>
          )}

          {/* Buy Button - hidden when user already owns this goddess.
              Locked until the awarding mission is completed. */}
          {session && !isOwnProfile && !isViewerOwner && (
            locked ? (
              <div className="w-full flex flex-col items-center gap-1 rounded-md bg-gray-800/70 border border-gray-700 py-2 px-2 min-h-[2.5rem] justify-center">
                <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-gray-300 leading-none">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
                <span className="text-[9px] sm:text-[10px] text-gray-400 font-mono tabular-nums leading-tight">
                  {formatNumber(effectiveCost)}¢
                </span>
                {unlockThreshold !== null && (
                  <span className="text-[9px] sm:text-[10px] text-gray-500 text-center leading-tight">
                    Collect {formatCompact(unlockThreshold)} cards to unlock
                  </span>
                )}
              </div>
            ) : (
              <Button
                onClick={handleBuyClick}
                disabled={!canAfford || mutation.isPending}
                className={`w-full font-bold py-2 text-[10px] sm:text-sm leading-tight h-auto min-h-[2.5rem] ${
                  canAfford
                    ? "bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white shadow-lg"
                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                }`}
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <>
                    <ShoppingCart className="h-4 w-4 mr-2" />
                    {formatNumber(effectiveCost)}¢
                  </>
                )}
              </Button>
            )
          )}

          {/* Sell-block countdown bar */}
          {blockSellUntil && new Date(blockSellUntil) > new Date() && (
            <div className="flex flex-col items-center gap-1 rounded-md bg-amber-950/50 border border-amber-500/30 py-1.5 px-2">
              <span className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-amber-400 leading-none tabular-nums">
                <Shield className="h-3 w-3" />
                <PartnershipCountdown blockSellUntil={blockSellUntil} />
              </span>
              <BlockCountdownBar blockSellUntil={blockSellUntil} className="w-[70%]" />
            </div>
          )}

          {/* Extend partnership (+10 min) — owner only. Cost = current value,
              burned from the economy. */}
          {isViewerOwner && (
            <Button
              onClick={handleExtendClick}
              disabled={!canAffordExtend || extendMutation.isPending}
              className={`w-full font-bold py-2 px-2 text-[9px] sm:text-[11px] leading-tight h-auto min-h-[2.5rem] ${
                canAffordExtend
                  ? "bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-white shadow-lg"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {extendMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5 shrink-0" />
              ) : (
                <Clock className="h-3 w-3 mr-1 shrink-0" />
              )}
              <span className="whitespace-normal break-all text-center leading-tight">+10 min · {formatNumber(effectiveCost)}¢</span>
            </Button>
          )}

          {/* Info footer */}
          <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t border-gray-800">
            <span className="flex items-center gap-1">
              <Crown className="h-3 w-3" />
              {ownerCount} owner{ownerCount !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Owns {ownedCount}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}