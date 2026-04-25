"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Crown, Clock, Star, Gem, ShoppingCart, Loader2, Briefcase, Coins, AlertTriangle, BadgeCheck, Shield, Swords, User, CreditCard, Camera } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { useSound } from "@/hooks/useSound";
import { useRouter } from "next/navigation";
import { useCredits } from "@/hooks/useCredits";
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
import { formatNumber, getDynamicFontSize } from "@/lib/utils";

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
}

function isRankBonusClaimedToday(lastRankBonusAt: string | Date | null | undefined): boolean {
  if (!lastRankBonusAt) return false;
  const d = typeof lastRankBonusAt === "string" ? new Date(lastRankBonusAt) : lastRankBonusAt;
  const today = new Date();
  return d.getFullYear() === today.getFullYear() &&
         d.getMonth() === today.getMonth() &&
         d.getDate() === today.getDate();
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
}: PlayerCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: myCredits } = useCredits();
  const isOwnProfile = session?.user?.name === username;
  const canAfford = (myCredits ?? 0) >= playerValue;
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
            "You own all 5 Goddesses! Hold them for 60 minutes to win the game! Other players will try to stop you!",
          duration: 15000,
        });
        await queryClient.invalidateQueries();
      } else {
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

  return (
    <Link href={`/players/${username}`}>
      <Card className="border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 cursor-pointer group">
        <CardContent className="p-4 relative">
          {/* TOP: Full-width avatar */}
          <div className="relative mb-3">
            <Avatar className="w-full h-auto aspect-square rounded-lg ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all">
              <AvatarImage src={avatarUrl || undefined} alt={username} className="object-cover" />
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

          {/* BOTTOM: All text info */}
          <div className={!isOwnProfile ? "pr-24 sm:pr-28" : ""}>

            {/* Username + badges */}
            <h3 className="font-semibold text-sm sm:text-base text-white group-hover:text-t1-400 transition-colors flex items-center gap-1.5 flex-wrap">
              {username}
              {isVerified === 1 && (
                <BadgeCheck className="h-4 w-4 text-blue-400 shrink-0" />
              )}
              {valueFloor >= 100 && (
                <Gem className="h-4 w-4 text-purple-400 shrink-0" />
              )}
              {valueFloor >= 10 && valueFloor < 100 && (
                <Star className="h-4 w-4 text-yellow-400 shrink-0" />
              )}
            </h3>

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

          {/* Square Hire button anchored to bottom-right corner */}
          {!isOwnProfile && (
            <Button
              onClick={handleBuyClick}
              disabled={!canAfford || mutation.isPending}
              className={`absolute bottom-3 right-3 h-16 w-16 sm:h-20 sm:w-20 p-0 rounded-md flex flex-col items-center justify-center gap-0.5 font-bold whitespace-nowrap ${
                canAfford
                  ? "bg-gradient-to-br from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white shadow-lg shadow-t1-500/20"
                  : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
            >
              {mutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="text-[10px] sm:text-xs leading-none">Hire</span>
                  <span className={`leading-none ${getDynamicFontSize(playerValue)}`}>
                    {formatNumber(playerValue)}¢
                  </span>
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

