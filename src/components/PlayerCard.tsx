"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Crown, Clock, Star, Gem, ShoppingCart, Loader2, Briefcase, Coins, AlertTriangle, BadgeCheck, Shield, Swords, User, CreditCard, Camera, X, Eye } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState as useLocalState, useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useOwnedPlayerIds } from "@/hooks/useOwnedPlayerIds";
import { getAvatarSrc } from "@/lib/avatar-utils";
import {
  getOwnedRank,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOnlineHours,
  getOwnedRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";
import { formatNumber, getDynamicFontSize, navbarBtnStyle } from "@/lib/utils";
import { GODDESS_USERNAMES } from "@/lib/goddesses";
import { BONUS_CARD_USERNAMES, BONUS_CARD_POWERS } from "@/lib/bonus-cards";

function formatLastOnline(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatTimeRemaining(date: string | Date | null | undefined): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((d.getTime() - Date.now()) / 1000);
  if (seconds <= 0) return "Now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

interface PlayerCardProps {
  id: number;
  username: string;
  avatarUrl: string | null;
  playerValue: number;
  valueFloor?: number;
  ownerCount: number;
  ownedCount: number;
  credits?: number;
  portfolioValue?: number;
  blockSellUntil?: string | Date | null;
  estimatedDeletionAt?: string | Date | null;
  isActive?: number;
  lastOnlineAt?: string | Date | null;
  totalOnlineMinutes?: number;
  createdAt?: string | Date | null;
  isVerified?: number;
  playerType?: string;
  photoAuthorName?: string | null;
  photoAuthorUrl?: string | null;
  photoSourceUrl?: string | null;
  lastRankBonusAt?: string | Date | null;
  ownerName?: string | null;
  ownerValue?: number | null;
  purchaseCount?: number;
  bio?: string | null;
  avatarRevealUntil?: string | Date | null;
  onHired?: (avatarUrl: string | null, username: string) => void;
}

function isRankBonusClaimedToday(lastRankBonusAt: string | Date | null | undefined): boolean {
  if (!lastRankBonusAt) return false;
  const d = typeof lastRankBonusAt === "string" ? new Date(lastRankBonusAt) : lastRankBonusAt;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate();
}

const REVEAL_DURATION_MS = 2000;

export function HireRevealModal({
  avatarUrl,
  username,
  onClose,
}: {
  avatarUrl: string | null;
  username: string;
  onClose: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useLocalState(REVEAL_DURATION_MS / 1000);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) {
          clearInterval(id);
          onCloseRef.current();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={() => onCloseRef.current()}
    >
      <div
        className="relative flex flex-col items-center gap-4"
        style={{ width: "min(66vw, 66vh)", maxWidth: "90vw" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onCloseRef.current()}
          className="absolute -top-10 right-0 text-gray-400 hover:text-white transition-colors z-10"
        >
          <X className="h-6 w-6" />
        </button>
        <p className="text-amber-300 font-bold text-sm uppercase tracking-widest">
          Player Revealed!
        </p>
        <div className="w-full aspect-square rounded-xl overflow-hidden shadow-2xl">
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-t1-600 to-t2-600 flex items-center justify-center text-white font-bold text-6xl">
              {username.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-white font-semibold text-xl">{username}</p>
          <span className="text-amber-400 font-bold text-lg tabular-nums">{secondsLeft}s</span>
        </div>
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(secondsLeft / (REVEAL_DURATION_MS / 1000)) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function PlayerCard({
  id,
  username,
  avatarUrl,
  playerValue,
  valueFloor = 1,
  ownerCount,
  ownedCount,
  credits,
  portfolioValue,
  blockSellUntil,
  estimatedDeletionAt,
  isActive,
  lastOnlineAt,
  totalOnlineMinutes,
  createdAt,
  isVerified,
  playerType,
  photoAuthorName,
  photoAuthorUrl,
  photoSourceUrl,
  lastRankBonusAt,
  ownerName,
  ownerValue,
  purchaseCount = 0,
  bio,
  avatarRevealUntil,
  onHired,
}: PlayerCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const { ownedIds } = useOwnedPlayerIds();
  const isOwnProfile = session?.user?.name === username;
  // State for temporary avatar reveal (1-minute reveal on leaderboard)
  const [isAvatarTempRevealed, setIsAvatarTempRevealed] = useState(false);

  // Check if avatar is revealed by any owner
  const isAvatarRevealed = avatarRevealUntil ? new Date(avatarRevealUntil) > new Date() : false;

  // Check if hire is blocked by a partner (sell block)
  const isHireBlocked = blockSellUntil ? new Date(blockSellUntil) > new Date() : false;
  const [blockCountdown, setBlockCountdown] = useState<string>("");
  const [blockRemainingMs, setBlockRemainingMs] = useState<number>(0);
  useEffect(() => {
    if (!isHireBlocked || !blockSellUntil) return;
    const update = () => {
      const ms = Math.max(0, new Date(blockSellUntil).getTime() - Date.now());
      setBlockRemainingMs(ms);
      setBlockCountdown(formatTimeRemaining(blockSellUntil) ?? "");
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [blockSellUntil, isHireBlocked]);
  
  const isBonusCard = BONUS_CARD_USERNAMES.includes(username);

  const displayedAvatarSrc = getAvatarSrc({
    avatarUrl,
    playerId: id,
    playerUsername: username,
    viewerUsername: session?.user?.name,
    ownedIds,
    isAvatarRevealed: isAvatarRevealed || isAvatarTempRevealed || isBonusCard,
  });
  const canAfford = isBonusCard || (myCredits ?? 0) >= playerValue;
  const { play } = useSound();
  const router = useRouter();

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
        old !== undefined ? old - playerValue : undefined
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
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        onHired?.(avatarUrl, username);
        toast.success(
          `You bought ${username}! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["player"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership"] }),
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

  const mutation6h = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id, blockDurationHours: 6 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - playerValue * 6 : undefined
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
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        onHired?.(avatarUrl, username);
        toast.success(
          `You bought ${username} with 6-hour block! Their value is now ${data.newValue} 💰`
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["player"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        ]);
      }
    },
  });

  const handle6hBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((myCredits ?? 0) < playerValue * 6) {
      toast.error(`Not enough credits. Need ${formatNumber(playerValue * 6)}¢ (6x player value)`);
      return;
    }
    const ok = window.confirm(
      `Hire ${username} with 6-hour sell block?\n\n` +
      `• Cost: ${formatNumber(playerValue * 6)}¢ (6x player value)\n` +
      `• They will be blocked from being sold for 6 hours\n` +
      `• This helps secure your investment`
    );
    if (!ok) return;
    play("hire");
    mutation6h.mutate();
  };

  const revealMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/reveal-avatar-short", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reveal avatar");
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Revealed ${username}'s avatar for 1 minute! 👁️`);
      setIsAvatarTempRevealed(true);
      // Auto-hide after 1 minute
      setTimeout(() => setIsAvatarTempRevealed(false), 60000);
      queryClient.invalidateQueries({ queryKey: ["credits"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Compute break cost from the interval-updated blockRemainingMs state (avoids Date.now() in render)
  const breakCost = isHireBlocked ? Math.ceil(blockRemainingMs / (60 * 60 * 1000)) * playerValue : 0;
  const totalBreakCost = breakCost + playerValue;

  const breakMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/game/break-partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to break partnership");
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["credits"] });
      const previousCredits = queryClient.getQueryData<number>(["credits"]);
      queryClient.setQueryData(["credits"], (old: number | undefined) =>
        old !== undefined ? old - totalBreakCost : undefined
      );
      return { previousCredits };
    },
    onError: (err: Error, _: unknown, context: { previousCredits?: number } | undefined) => {
      if (context?.previousCredits !== undefined) {
        queryClient.setQueryData(["credits"], context.previousCredits);
      }
      toast.error(err.message);
    },
    onSuccess: async (data) => {
      if (data.countdownStarted) {
        toast.success("⏱️ COUNTDOWN STARTED! ⏱️", {
          description:
            "You own all 6 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
        onHired?.(avatarUrl, username);
        toast.success(`Partnership broken! You hired ${username}! Their value is now ${data.newValue} 💰`);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["credits"] }),
          queryClient.invalidateQueries({ queryKey: ["player"] }),
          queryClient.invalidateQueries({ queryKey: ["players"] }),
          queryClient.invalidateQueries({ queryKey: ["ownership"] }),
          queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        ]);
      }
    },
  });

  const handleBreakClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((myCredits ?? 0) < totalBreakCost) {
      toast.error(`Not enough credits. Need ${formatNumber(totalBreakCost)}¢ (${formatNumber(breakCost)}¢ break fee + ${formatNumber(playerValue)}¢ hire)`);
      return;
    }
    const ok = window.confirm(
      `Break partnership on ${username}?\n\n` +
      `• Break fee: ${formatNumber(breakCost)}¢ (paid to current owner)\n` +
      `• Hire cost: ${formatNumber(playerValue)}¢\n` +
      `• Total: ${formatNumber(totalBreakCost)}¢\n\n` +
      `The current owner will receive the break fee as compensation.`
    );
    if (!ok) return;
    play("hire");
    breakMutation.mutate(undefined);
  };

  // Reveal cost doubles when player is sell-blocked
  const revealCostRate = isHireBlocked ? 0.2 : 0.1;
  const revealCost = Math.round(playerValue * revealCostRate * 100) / 100;

  const handleRevealClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if ((myCredits ?? 0) < revealCost) {
      toast.error(`Not enough credits. Need ${formatNumber(revealCost)}¢ (${Math.round(revealCostRate * 100)}% of player value)`);
      return;
    }
    play("hire");
    revealMutation.mutate();
  };

  return (
    <Link href={`/players/${username}`}>
      <Card className="border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 cursor-pointer group">
        <CardContent className="p-4 relative">
          {/* TOP: Full-width avatar */}
          <div className="relative mb-3">
            <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
              <AvatarImage src={displayedAvatarSrc} alt={username} className="object-cover" />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-4xl sm:text-5xl">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {isActive === 0 && (
              <Badge
                variant="secondary"
                className="absolute top-2 left-2 bg-red-500/20 text-red-300 border-red-500/30 text-[10px] backdrop-blur-sm"
              >
                Inactive
              </Badge>
            )}
          </div>

          {/* USERNAME: prominent row directly below avatar */}
          <div className="w-full mb-12">
            <h3
              className="font-bold text-white group-hover:text-t1-400 transition-colors leading-tight break-words text-left flex items-center justify-start gap-1.5 flex-wrap"
              style={{ fontSize: "clamp(1.1rem, 3.5vw, 1.875rem)" }}
            >
              {username}
              {isVerified === 1 && (
                <BadgeCheck className="h-5 w-5 text-blue-400 shrink-0" />
              )}
              {valueFloor >= 100 && (
                <Gem className="h-5 w-5 text-purple-400 shrink-0" />
              )}
              {valueFloor >= 10 && valueFloor < 100 && (
                <Star className="h-5 w-5 text-yellow-400 shrink-0" />
              )}
            </h3>
          </div>

          {/* BOTTOM: All text info */}
          <div className={!isOwnProfile ? "pr-[150px] sm:pr-[180px]" : ""}>

            {/* Player type + Rank Titles */}
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {playerType === "human" ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-emerald-300 bg-emerald-500/15 border-emerald-500/30">
                  <User className="h-2.5 w-2.5" />
                  Human
                </span>
              ) : (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-cyan-300 bg-cyan-500/15 border-cyan-500/30">
                  <CreditCard className="h-2.5 w-2.5" />
                  Card
                </span>
              )}
              {playerType === "human" && isRankBonusClaimedToday(lastRankBonusAt) && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-yellow-300 bg-yellow-500/15 border-yellow-500/30">
                  <Coins className="h-2.5 w-2.5" />
                  Bonus
                </span>
              )}
              {playerType === "human" && (
                <>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getOwnedRankColor(ownedCount)}`}>
                    <Swords className="h-2.5 w-2.5" />
                    {getOwnedRank(ownedCount).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getCreditsRankColor(credits ?? 0)}`}>
                    <Coins className="h-2.5 w-2.5" />
                    {getCreditsRank(credits ?? 0).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getValueRankColor(playerValue)}`}>
                    <TrendingUp className="h-2.5 w-2.5" />
                    {getValueRank(playerValue).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getPortfolioRankColor(portfolioValue ?? 0)}`}>
                    <Briefcase className="h-2.5 w-2.5" />
                    {getPortfolioRank(portfolioValue ?? 0).title}
                  </span>
                </>
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Crown className="h-3 w-3 text-yellow-400 shrink-0" />
                {ownerCount}
              </span>
              {ownerName && (
                <span className="flex items-center gap-1 text-yellow-300/80 min-w-0">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="truncate">{ownerName}{ownerValue !== null && ownerValue !== undefined ? ` (${ownerValue}$)` : ''}</span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-t2-400 shrink-0" />
                {ownedCount}
              </span>
              <span className="flex items-center gap-1 text-orange-400">
                <ShoppingCart className="h-3 w-3 shrink-0" />
                {purchaseCount}x
              </span>
              {portfolioValue !== undefined && (
                <span className={`flex items-center gap-1 ${getDynamicFontSize(Math.round(portfolioValue))}`}>
                  <Briefcase className="h-3 w-3 text-purple-400 shrink-0" />
                  {formatNumber(Math.round(portfolioValue))}¢
                </span>
              )}
              {credits !== undefined && (
                <span className={`flex items-center gap-1 text-t1-400 ${getDynamicFontSize(Number(credits.toFixed(2)))}`}>
                  <Coins className="h-3 w-3 shrink-0" />
                  {formatNumber(Number(credits.toFixed(2)))}¢
                </span>
              )}
            </div>

            {/* Bio */}
            {bio && (
              <p className="mt-1.5 text-[11px] text-gray-400 italic line-clamp-2 leading-snug">
                &ldquo;{bio}&rdquo;
              </p>
            )}

            {/* Bonus Card Power Description */}
            {isBonusCard && (
              <p className="mt-1.5 text-[11px] text-purple-300 font-medium line-clamp-2 leading-snug">
                ✨ {BONUS_CARD_POWERS[username]}
              </p>
            )}

            {/* Footer: last online */}
            <div className="flex items-center gap-3 mt-1 text-[11px]">
              <span className="flex items-center gap-1 text-gray-500">
                <Clock className="h-3 w-3" />
                {formatLastOnline(lastOnlineAt)}
              </span>
            </div>

            {/* Photo attribution (Unsplash / Pexels) */}
            {(photoAuthorName || photoSourceUrl) && (() => {
              // Resolve display URL: convert picsum /info URLs to image URLs
              const displaySourceUrl = photoSourceUrl?.includes("picsum.photos") && photoSourceUrl?.endsWith("/info")
                ? photoSourceUrl.replace("/info", "/512/512")
                : photoSourceUrl;
              // Detect source name from URLs
              const sourceName = photoSourceUrl?.includes("pexels") ? "Pexels"
                : photoSourceUrl?.includes("unsplash") ? "Unsplash"
                : photoSourceUrl?.includes("picsum") ? "Unsplash"
                : "Source";
              return (
                <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-600" onClick={(e) => e.stopPropagation()}>
                  <Camera className="h-2.5 w-2.5 shrink-0" />
                  <span>
                    {photoAuthorName ? (
                      <>
                        Photo by{" "}
                        {photoAuthorUrl ? (
                          <a
                            href={photoAuthorUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-500 hover:text-gray-300 underline decoration-dotted underline-offset-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {photoAuthorName}
                          </a>
                        ) : (
                          photoAuthorName
                        )}
                        {displaySourceUrl && (
                          <>
                            {" on "}
                            <a
                              href={displaySourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-500 hover:text-gray-300 underline decoration-dotted underline-offset-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {sourceName}
                            </a>
                          </>
                        )}
                      </>
                    ) : displaySourceUrl ? (
                      <>
                        Photo from{" "}
                        <a
                          href={displaySourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-500 hover:text-gray-300 underline decoration-dotted underline-offset-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sourceName}
                        </a>
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Bottom-right action buttons: Hire + Reveal */}
          {!isOwnProfile && (
            <div className="absolute bottom-3 right-3 flex flex-row items-end gap-2">
              {isHireBlocked ? (
                <>
                  {/* Partnered info badge */}
                  <div className="h-16 sm:h-20 px-2 rounded-md flex flex-col items-center justify-center gap-0.5 bg-amber-950/60 border border-amber-500/40 text-amber-400 text-center">
                    <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
                    <span className="text-[8px] sm:text-[9px] leading-none font-bold">Partnered</span>
                    <span className="text-[8px] sm:text-[9px] leading-none tabular-nums">{blockCountdown}</span>
                  </div>
                  {/* Reveal (2x) + Break stacked column */}
                  <div className="flex flex-col gap-2">
                    {/* Reveal button at 2x cost - shown when not owned, not yet revealed, and not a bonus card */}
                    {!ownedIds.has(id) && !isAvatarTempRevealed && !isAvatarRevealed && !BONUS_CARD_USERNAMES.includes(username) && (
                      <Button
                        onClick={handleRevealClick}
                        disabled={revealMutation.isPending || (myCredits ?? 0) < revealCost}
                        className={`h-16 w-16 sm:h-20 sm:w-20 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap ${
                          (myCredits ?? 0) >= revealCost
                            ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                            : "bg-gray-700 text-gray-400 cursor-not-allowed"
                        }`}
                        style={(myCredits ?? 0) >= revealCost ? navbarBtnStyle : undefined}
                      >
                        {revealMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                            <span className="text-[9px] sm:text-[10px] leading-none">Reveal 2x</span>
                            <span className={`leading-none mt-0.5 ${getDynamicFontSize(revealCost)}`}>
                              {formatNumber(revealCost)}¢
                            </span>
                          </>
                        )}
                      </Button>
                    )}
                    {/* Break partnership button - disabled for bonus cards */}
                    <Button
                      onClick={handleBreakClick}
                      disabled={breakMutation.isPending || (myCredits ?? 0) < totalBreakCost || BONUS_CARD_USERNAMES.includes(username)}
                      className={`h-16 w-16 sm:h-20 sm:w-20 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap ${
                        (myCredits ?? 0) >= totalBreakCost && !BONUS_CARD_USERNAMES.includes(username)
                          ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                          : "bg-gray-700 text-gray-400 cursor-not-allowed"
                      }`}
                      style={(myCredits ?? 0) >= totalBreakCost && !BONUS_CARD_USERNAMES.includes(username) ? navbarBtnStyle : undefined}
                    >
                      {breakMutation.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : BONUS_CARD_USERNAMES.includes(username) ? (
                        <>
                          <Shield className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                          <span className="text-[8px] sm:text-[9px] leading-none">Unbreakable</span>
                          <span className="text-[8px] sm:text-[9px] leading-none">Block</span>
                        </>
                      ) : (
                        <>
                          <Shield className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                          <span className="text-[8px] sm:text-[9px] leading-none">Break</span>
                          <span className={`leading-none mt-0.5 ${getDynamicFontSize(totalBreakCost)}`}>
                            {formatNumber(totalBreakCost)}¢
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Regular 1-hour hire button */}
                  <Button
                    onClick={handleBuyClick}
                    disabled={!canAfford || mutation.isPending}
                    className={`h-16 w-16 sm:h-20 sm:w-20 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap ${
                      canAfford
                        ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                        : "bg-gray-700 text-gray-400 cursor-not-allowed"
                    }`}
                    style={canAfford ? navbarBtnStyle : undefined}
                  >
                    {mutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : BONUS_CARD_USERNAMES.includes(username) ? (
                      <>
                        <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                        <span className="text-[9px] sm:text-[10px] leading-none">Hire 3h</span>
                        <span className="text-[9px] sm:text-[10px] leading-none">Block</span>
                        <span className="text-[9px] sm:text-[10px] leading-none mt-0.5 text-purple-300">Free</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                        <span className="text-[9px] sm:text-[10px] leading-none">Hire 1h</span>
                        <span className="text-[9px] sm:text-[10px] leading-none">Block</span>
                        <span className={`leading-none mt-0.5 ${getDynamicFontSize(playerValue)}`}>
                          {formatNumber(playerValue)}¢
                        </span>
                      </>
                    )}
                  </Button>
                  {/* 6h hire + Reveal stacked column (hidden for goddesses and bonus cards) */}
                  {!GODDESS_USERNAMES.includes(username) && !BONUS_CARD_USERNAMES.includes(username) && (
                  <div className="flex flex-col gap-2">
                    {/* Reveal Avatar button - shown when not owned, not yet revealed, and not a bonus card */}
                    {!ownedIds.has(id) && !isAvatarTempRevealed && !isAvatarRevealed && !BONUS_CARD_USERNAMES.includes(username) && (
                      <Button
                        onClick={handleRevealClick}
                        disabled={revealMutation.isPending || (myCredits ?? 0) < playerValue * 0.1}
                        className={`h-16 w-16 sm:h-20 sm:w-20 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap ${
                          (myCredits ?? 0) >= playerValue * 0.1
                            ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                            : "bg-gray-700 text-gray-400 cursor-not-allowed"
                        }`}
                        style={(myCredits ?? 0) >= playerValue * 0.1 ? navbarBtnStyle : undefined}
                      >
                        {revealMutation.isPending ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <Eye className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                            <span className="text-[9px] sm:text-[10px] leading-none">Reveal</span>
                            <span className={`leading-none mt-0.5 ${getDynamicFontSize(playerValue * 0.1)}`}>
                              {formatNumber(Math.round(playerValue * 0.1 * 100) / 100)}¢
                            </span>
                          </>
                        )}
                      </Button>
                    )}
                    {/* 6-hour hire button */}
                    <Button
                      onClick={handle6hBuyClick}
                      disabled={(myCredits ?? 0) < playerValue * 6 || mutation6h.isPending}
                      className={`h-16 w-16 sm:h-20 sm:w-20 p-0 rounded-md flex flex-col items-center justify-center gap-0 font-bold whitespace-nowrap ${
                        (myCredits ?? 0) >= playerValue * 6
                          ? "text-white bg-transparent hover:brightness-125 hover:bg-transparent drop-shadow-lg"
                          : "bg-gray-700 text-gray-400 cursor-not-allowed"
                      }`}
                      style={(myCredits ?? 0) >= playerValue * 6 ? navbarBtnStyle : undefined}
                    >
                      {mutation6h.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          <ShoppingCart className="h-3 w-3 sm:h-4 sm:w-4 mb-0.5" />
                          <span className="text-[9px] sm:text-[10px] leading-none">Hire 6h</span>
                          <span className="text-[9px] sm:text-[10px] leading-none">Block</span>
                          <span className={`leading-none mt-0.5 ${getDynamicFontSize(playerValue * 6)}`}>
                            {formatNumber(playerValue * 6)}¢
                          </span>
                        </>
                      )}
                    </Button>
                  </div>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

