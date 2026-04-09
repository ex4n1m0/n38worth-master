"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuyButton } from "@/components/BuyButton";
import { OwnershipList } from "@/components/OwnershipList";
import { AvatarUpload } from "@/components/AvatarUpload";
import { useCredits } from "@/hooks/useCredits";
import {
  TrendingUp,
  Crown,
  Users,
  Calendar,
  Clock,
  Loader2,
  Star,
  Gem,
  Briefcase,
  Coins,
  AlertTriangle,
  Shield,
  Swords,
  User,
  CreditCard,
  Camera,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageContext";
import { useOnboarding } from "@/components/OnboardingContext";
import {
  getOwnedRank,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOnlineHours,
  getNextOwnedRank,
  getNextCreditsRank,
  getNextValueRank,
  getNextPortfolioRank,
  getOwnedRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";
import { formatNumber } from "@/lib/utils";

function formatLastOnline(date: string | Date | null | undefined): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
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

export default function PlayerProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const { data: session } = useSession();
  const { t } = useLanguage();
  const { state: onboarding } = useOnboarding();

  const { data: player, isLoading } = useQuery({
    queryKey: ["player", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    refetchInterval: 60 * 1000, // Update every minute for estimated deletion
  });

  const { data: credits } = useCredits();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-white">{t.playerNotFound}</h2>
        <p className="text-gray-400 mt-2">
          "{username}"
        </p>
      </div>
    );
  }

  const isOwnProfile = session?.user?.name === username;
  const showOnboardingMessage = isOwnProfile && !onboarding.avatarCompleted;
  const alreadyOwns = player.owners?.some(
    (o: { username: string }) => o.username === session?.user?.name
  );
  const canBuy =
    !isOwnProfile && !alreadyOwns && (credits ?? 0) >= player.playerValue;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Onboarding Message */}
      {showOnboardingMessage && (
        <div className="bg-gradient-to-r from-yellow-900/30 to-amber-900/30 border border-yellow-500/40 rounded-lg p-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Camera className="h-5 w-5 text-yellow-400" />
            <p className="text-yellow-200 text-lg font-bold">
              🎯 Change your avatar to unlock Market
            </p>
          </div>
          <p className="text-yellow-300 text-sm">
            Upload a custom profile picture to start your journey!
          </p>
        </div>
      )}

      {/* Profile Header */}
      <Card className="border-gray-800 bg-gray-900/60 overflow-hidden">
        <div className="h-32 bg-gradient-to-r from-t1-600/20 via-t2-600/20 to-t1-600/20" />
        <CardContent className="relative px-6 pb-6">
          <div className="flex flex-col gap-4 -mt-12">
            <div className="flex flex-col gap-2">
              {isOwnProfile ? (
                <AvatarUpload
                  currentUrl={player.avatarUrl ?? null}
                  username={player.username}
                  avatarCompleted={onboarding.avatarCompleted}
                />
              ) : (
                <Avatar className="h-24 w-24 sm:h-32 sm:w-32 md:h-40 md:w-40 ring-4 ring-gray-900 shadow-xl shrink-0">
                  <AvatarImage src={player.avatarUrl || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-t1-600 to-t2-600 text-white text-2xl font-bold">
                    {player.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <h1 className="text-base sm:text-2xl font-bold text-white flex items-center gap-2 truncate max-w-full">
                <span className="truncate">{player.username}</span>
                {player.valueFloor >= 100 && (
                  <Gem className="h-5 w-5 text-purple-400" />
                )}
                {player.valueFloor >= 10 && player.valueFloor < 100 && (
                  <Star className="h-5 w-5 text-yellow-400" />
                )}
              </h1>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <div className="flex items-center gap-1 flex-wrap">
                  {player.playerType === "human" ? (
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
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border text-gray-400 bg-gray-500/15 border-gray-500/30">
                    <Shield className="h-2.5 w-2.5" />
                    {player.ownerCount} owner{player.ownerCount !== 1 ? "s" : ""}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getOwnedRankColor(player.ownedCount)}`}>
                    <Swords className="h-2.5 w-2.5" />
                    {getOwnedRank(player.ownedCount).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getCreditsRankColor(player.credits ?? 0)}`}>
                    <Coins className="h-2.5 w-2.5" />
                    {getCreditsRank(player.credits ?? 0).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getValueRankColor(player.playerValue)}`}>
                    <TrendingUp className="h-2.5 w-2.5" />
                    {getValueRank(player.playerValue).title}
                  </span>
                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold px-1 py-0.5 rounded border ${getPortfolioRankColor(player.portfolioValue ?? 0)}`}>
                    <Briefcase className="h-2.5 w-2.5" />
                    {getPortfolioRank(player.portfolioValue ?? 0).title}
                  </span>
                </div>
                {player.portfolioValue !== undefined && (
                  <Badge
                    variant="secondary"
                    className="bg-purple-500/10 text-purple-400 border-purple-500/20 font-mono"
                  >
                    <Briefcase className="h-3 w-3 mr-1" />
                    {formatNumber(Math.round(player.portfolioValue))}¢
                  </Badge>
                )}
                {isOwnProfile && (
                  <Badge
                    variant="secondary"
                    className="bg-t1-500/10 text-t1-400 border-t1-500/20"
                  >
                    You
                  </Badge>
                )}
                {player.isActive === 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-red-500/10 text-red-400 border-red-500/20"
                  >
                    Non Active
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 sm:gap-4 mt-2 text-xs sm:text-sm text-gray-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Joined{" "}
                  {new Date(player.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {player.lastOnlineAt ? `Last seen ${formatLastOnline(player.lastOnlineAt)}` : "Never seen"}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isOwnProfile && (
                <BuyButton
                  targetId={player.id}
                  targetUsername={player.username}
                  cost={player.playerValue}
                  disabled={!canBuy}
                />
              )}
            </div>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-8">
            <div className="text-center p-3 sm:p-4 rounded-lg bg-gray-800/50 border border-gray-700/60 overflow-hidden">
              <TrendingUp className="h-5 w-5 text-t1-400 mx-auto mb-1" />
              <p className="text-sm sm:text-2xl font-bold font-mono text-white truncate">
                {formatNumber(player.playerValue)}¢
              </p>
              <p className="text-[10px] sm:text-xs text-gray-400">{t.playerValue}</p>
            </div>
            <div className="text-center p-3 sm:p-4 rounded-lg bg-gray-800/50 border border-gray-700/60 overflow-hidden">
              <Coins className="h-5 w-5 text-t1-400 mx-auto mb-1" />
              <p className="text-sm sm:text-2xl font-bold font-mono text-white truncate">
                {formatNumber(parseFloat((player.credits ?? 0).toFixed(2)))}¢
              </p>
              <p className="text-[10px] sm:text-xs text-gray-400">{t.credits}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-gray-800/50 border border-gray-700/60">
              <Crown className="h-5 w-5 text-yellow-400 mx-auto mb-1" />
              <p className="text-lg sm:text-2xl font-bold font-mono text-white">
                {player.ownerCount}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-400">{t.owners}</p>
            </div>
            <div className="text-center p-4 rounded-lg bg-gray-800/50 border border-gray-700/60">
              <Users className="h-5 w-5 text-t2-400 mx-auto mb-1" />
              <p className="text-lg sm:text-2xl font-bold font-mono text-white">
                {player.ownedCount}
              </p>
              <p className="text-[10px] sm:text-xs text-gray-400">{t.owns}</p>
            </div>
          </div>

          {/* Rank Titles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
            {/* Player Type */}
            <div className={`rounded-lg border p-3 ${player.playerType === "human" ? "text-emerald-300 bg-emerald-500/15 border-emerald-500/30" : "text-cyan-300 bg-cyan-500/15 border-cyan-500/30"}`}>
              <div className="flex items-center gap-2 mb-1">
                {player.playerType === "human" ? <User className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Player Type</span>
              </div>
              <p className="text-sm sm:text-base font-bold">{player.playerType === "human" ? "Human" : "Card"}</p>
              <p className="text-[10px] opacity-60 mt-0.5">
                {player.playerType === "human" ? "Real player account" : "Auto-generated NPC"}
              </p>
            </div>
            {/* Owner Info */}
            <div className="rounded-lg border p-3 text-gray-400 bg-gray-500/15 border-gray-500/30">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Owners</span>
              </div>
              <p className="text-sm sm:text-base font-bold">{player.ownerCount} owner{player.ownerCount !== 1 ? "s" : ""}</p>
              <p className="text-[10px] opacity-60 mt-0.5">
                Demand from other players
              </p>
            </div>
            {/* Owned Rank */}
            <div className={`rounded-lg border p-3 ${getOwnedRankColor(player.ownedCount)}`}>
              <div className="flex items-center gap-2 mb-1">
                <Swords className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Empire Rank</span>
              </div>
              <p className="text-sm sm:text-base font-bold">{getOwnedRank(player.ownedCount).title}</p>
              <p className="text-[10px] opacity-60 mt-0.5">
                {player.ownedCount} player{player.ownedCount !== 1 ? "s" : ""} owned
                {getNextOwnedRank(player.ownedCount) && (
                  <> · Next: {getNextOwnedRank(player.ownedCount)!.title} at {getNextOwnedRank(player.ownedCount)!.threshold}</>
                )}
              </p>
            </div>
            {/* Credits Rank */}
            {(() => {
              const c = player.credits ?? 0;
              return (
                <div className={`rounded-lg border p-3 ${getCreditsRankColor(c)}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Coins className="h-4 w-4" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Credits Rank</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold">{getCreditsRank(c).title}</p>
                  <p className="text-[10px] opacity-60 mt-0.5">
                    {Math.round(c).toLocaleString()}¢
                    {getNextCreditsRank(c) && (
                      <> · Next: {getNextCreditsRank(c)!.title} at {getNextCreditsRank(c)!.threshold.toLocaleString()}¢</>
                    )}
                  </p>
                </div>
              );
            })()}
            {/* Value Rank */}
            <div className={`rounded-lg border p-3 ${getValueRankColor(player.playerValue)}`}>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4" />
                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Value Rank</span>
              </div>
              <p className="text-sm sm:text-base font-bold">{getValueRank(player.playerValue).title}</p>
              <p className="text-[10px] opacity-60 mt-0.5">
                {player.playerValue} value
                {getNextValueRank(player.playerValue) && (
                  <> · Next: {getNextValueRank(player.playerValue)!.title} at {getNextValueRank(player.playerValue)!.threshold}</>
                )}
              </p>
            </div>
            {/* Portfolio Rank */}
            {(() => {
              const pv = player.portfolioValue ?? 0;
              return (
                <div className={`rounded-lg border p-3 ${getPortfolioRankColor(pv)}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Briefcase className="h-4 w-4" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Portfolio Rank</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold">{getPortfolioRank(pv).title}</p>
                  <p className="text-[10px] opacity-60 mt-0.5">
                    {Math.round(pv).toLocaleString()}¢ portfolio
                    {getNextPortfolioRank(pv) && (
                      <> · Next: {getNextPortfolioRank(pv)!.title} at {getNextPortfolioRank(pv)!.threshold.toLocaleString()}¢</>
                    )}
                  </p>
                </div>
              );
            })()}
          </div>

          {!isOwnProfile && alreadyOwns && (
            <div className="mt-4 p-3 rounded-lg bg-t1-500/10 border border-t1-500/20 text-t1-400 text-sm">
              ✓ You already own this player
            </div>
          )}
          {!isOwnProfile && !alreadyOwns && (credits ?? 0) < player.playerValue && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              You need {player.playerValue - (credits ?? 0)} more credits to buy this player
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ownership Details */}
      <Card className="border-gray-800 bg-gray-900/60">
        <Tabs defaultValue="owners" className="w-full">
          <CardHeader className="pb-0">
            <TabsList className="bg-gray-800">
              <TabsTrigger
                value="owners"
                className="data-[state=active]:bg-t1-600 data-[state=active]:text-white"
              >
                <Crown className="h-4 w-4 mr-2" />
                {t.owners} ({player.owners?.length ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="owned"
                className="data-[state=active]:bg-t1-600 data-[state=active]:text-white"
              >
                <Users className="h-4 w-4 mr-2" />
                {t.owns} ({player.ownedPlayers?.length ?? 0})
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <CardContent className="pt-6">
            <TabsContent value="owners" className="mt-0">
              <OwnershipList
                items={
                  player.owners?.map(
                    (p: {
                      ownershipId: number;
                      id: number;
                      username: string;
                      avatarUrl: string | null;
                      playerValue: number;
                      purchasePrice: number;
                      credits?: number;
                      portfolioValue?: number;
                      ownerCount?: number;
                      ownedCount?: number;
                      blockSellUntil?: string | null;
                      blockSellBy?: string | null;
                      estimatedDeletionAt?: string | null;
                    }) => ({ ...p })
                  ) ?? []
                }
                type="owners"
                showSellOut={false}
                showBlockSell={false}
                myPlayerValue={player.playerValue}
              />
            </TabsContent>
            <TabsContent value="owned" className="mt-0">
              <OwnershipList
                items={
                  player.ownedPlayers?.map(
                    (p: {
                      ownershipId: number;
                      id: number;
                      username: string;
                      avatarUrl: string | null;
                      playerValue: number;
                      purchasePrice: number;
                      credits?: number;
                      portfolioValue?: number;
                      ownerCount?: number;
                      ownedCount?: number;
                      lastOnlineAt?: string | null;
                      blockSellUntil?: string | null;
                      blockSellBy?: string | null;
                      estimatedDeletionAt?: string | null;
                    }) => ({ ...p })
                  ) ?? []
                }
                type="owned"
                showDiscard={isOwnProfile}
                showSendCredits={isOwnProfile}
              />
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
