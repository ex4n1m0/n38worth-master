"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, Users, Crown, Clock, Star, Gem, ShoppingCart, Loader2, Briefcase, Coins, AlertTriangle, BadgeCheck, Shield, Swords, Hourglass, User, CreditCard, Camera } from "lucide-react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import {
  getOwnedRank,
  getAgeRank,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOnlineHours,
  getAgeDays,
  getOwnedRankColor,
  getAgeRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";

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
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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
}: PlayerCardProps) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isOwnProfile = session?.user?.name === username;

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
    },
  });

  const handleBuyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mutation.mutate();
  };

  return (
    <Link href={`/players/${username}`}>
      <Card className="border-gray-800 bg-gray-900/60 hover:bg-gray-900/90 hover:border-gray-700 transition-all duration-200 cursor-pointer group">
        <CardContent className="p-4">
          {/* TOP: Avatar + Buy button */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <Avatar className="h-32 w-32 sm:h-44 sm:w-44 md:h-52 md:w-52 ring-2 ring-gray-700 group-hover:ring-t1-500/50 transition-all shrink-0">
              <AvatarImage src={avatarUrl || undefined} alt={username} />
              <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white font-bold text-base sm:text-lg">
                {username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                {isActive === 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]"
                  >
                    Inactive
                  </Badge>
                )}
                <Badge
                  variant="secondary"
                  className="bg-t1-500/10 text-t1-400 border-t1-500/20 font-mono text-xs"
                >
                  {playerValue}¢
                </Badge>
              </div>
              {!isOwnProfile && (
                <Button
                  onClick={handleBuyClick}
                  disabled={mutation.isPending}
                  className="bg-gradient-to-r from-t1-600 to-t2-600 hover:from-t1-500 hover:to-t2-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-t1-500/20 px-2.5 py-1.5 sm:px-4 sm:py-2 h-auto whitespace-nowrap"
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                      Buy {playerValue}¢
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* BOTTOM: All text info */}
          <div>
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
              {isRankBonusClaimedToday(lastRankBonusAt) && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-yellow-300 bg-yellow-500/15 border-yellow-500/30">
                  <Coins className="h-2.5 w-2.5" />
                  Bonus
                </span>
              )}
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getOwnedRankColor(ownedCount)}`}>
                <Swords className="h-2.5 w-2.5" />
                {getOwnedRank(ownedCount).title}
              </span>
              <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getAgeRankColor(getAgeDays(createdAt))}`}>
                <Hourglass className="h-2.5 w-2.5" />
                {getAgeRank(getAgeDays(createdAt)).title}
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
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-t1-400" />
                {playerValue}
              </span>
              <span className="flex items-center gap-1">
                <Crown className="h-3 w-3 text-yellow-400" />
                {ownerCount}
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3 text-t2-400" />
                {ownedCount}
              </span>
              {portfolioValue !== undefined && (
                <span className="flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-purple-400" />
                  {Math.round(portfolioValue)}¢
                </span>
              )}
              {credits !== undefined && (
                <span className="flex items-center gap-1 text-t1-400">
                  <Coins className="h-3 w-3" />
                  {credits.toFixed(2)}¢
                </span>
              )}
            </div>

            {/* Footer: last online + deletion */}
            <div className="flex items-center gap-3 mt-1 text-[11px]">
              <span className="flex items-center gap-1 text-gray-500">
                <Clock className="h-3 w-3" />
                {formatLastOnline(lastOnlineAt)}
              </span>
              {estimatedDeletionAt && (
                <span className="flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3 w-3" />
                  Deletion in {formatTimeRemaining(estimatedDeletionAt)}
                </span>
              )}
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
        </CardContent>
      </Card>
    </Link>
  );
}
