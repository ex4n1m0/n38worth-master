"use client";

import { useSession } from "next-auth/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCredits } from "@/hooks/useCredits";
import { AvatarUpload } from "@/components/AvatarUpload";
import {
  Coins,
  Crown,
  Users,
  Loader2,
  TrendingUp,
  Briefcase,
  Shield,
  Swords,
  Hourglass,
} from "lucide-react";
import {
  getOwnedRank,
  getAgeRank,
  getAgeDays,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOwnedRankColor,
  getAgeRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
} from "@/lib/ranks";

export function MyProfileCard() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: player, isLoading: playerLoading } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000,
  });

  const { data: credits } = useCredits();

  if (!session?.user?.name) return null;

  if (playerLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-t1-400" />
      </div>
    );
  }

  const basePortfolio =
    (player?.playerValue ?? 0) +
    (player?.ownedPlayers?.reduce(
      (sum: number, p: { playerValue: number }) => sum + p.playerValue,
      0
    ) ?? 0);
  const myOwnerCount = player?.ownerCount ?? 0;
  const portfolioValue = basePortfolio * Math.max(myOwnerCount, 1);

  return (
    <Card className="border-gray-800 bg-gradient-to-br from-gray-900/80 to-gray-950/80 overflow-hidden">
      <CardContent className="p-4 sm:p-6">
        {/* Top: Avatar + Name + Value */}
        <div className="flex flex-row items-start gap-4 sm:gap-5">
          <AvatarUpload
            currentUrl={player?.avatarUrl ?? null}
            username={session?.user?.name || ""}
          />
        </div>

        <div className="mt-4 sm:mt-5">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold bg-gradient-to-r from-t1-400 to-t2-400 bg-clip-text text-transparent truncate">
              {session?.user?.name}
            </h2>
          </div>
          {/* Rank Badges - All 5 */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getOwnedRankColor(player?.ownedPlayers?.length ?? 0)}`}>
              <Swords className="h-2.5 w-2.5" />
              {getOwnedRank(player?.ownedPlayers?.length ?? 0).title}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getAgeRankColor(getAgeDays(player?.createdAt))}`}>
              <Hourglass className="h-2.5 w-2.5" />
              {getAgeRank(getAgeDays(player?.createdAt)).title}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getCreditsRankColor(credits ?? 0)}`}>
              <Coins className="h-2.5 w-2.5" />
              {getCreditsRank(credits ?? 0).title}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getValueRankColor(player?.playerValue ?? 0)}`}>
              <TrendingUp className="h-2.5 w-2.5" />
              {getValueRank(player?.playerValue ?? 0).title}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${getPortfolioRankColor(portfolioValue)}`}>
              <Briefcase className="h-2.5 w-2.5" />
              {getPortfolioRank(portfolioValue).title}
            </span>
          </div>

          {/* Player Value + Self Inflate */}
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-400 shrink-0" />
              <span className="text-base sm:text-lg font-bold font-mono text-green-400">
                {player?.playerValue ?? 1}¢
              </span>
              <span className="text-xs text-gray-500">value</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Coins className="h-3.5 w-3.5 text-t1-400" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">Credits</span>
            </div>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {(credits ?? 0).toFixed(0)}¢
            </span>
          </div>
          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Briefcase className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">Portfolio</span>
            </div>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {portfolioValue.toFixed(0)}¢
            </span>
          </div>
          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Crown className="h-3.5 w-3.5 text-yellow-400" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">Owners</span>
            </div>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {player?.ownerCount ?? 0}
            </span>
          </div>
          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Users className="h-3.5 w-3.5 text-t1-400" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">Players</span>
            </div>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {player?.ownedPlayers?.length ?? 0}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}