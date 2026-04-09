"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { useCredits } from "@/hooks/useCredits";
import {
  Coins,
  Crown,
  Users,
  Loader2,
  TrendingUp,
  Briefcase,
  Shield,
  Swords,
} from "lucide-react";
import {
  getOwnedRank,
  getCreditsRank,
  getValueRank,
  getPortfolioRank,
  getOwnedRankColor,
  getCreditsRankColor,
  getValueRankColor,
  getPortfolioRankColor,
  getOwnedRankTier,
  getCreditsRankTier,
  getValueRankTier,
  getPortfolioRankTier,
  getRankCount,
} from "@/lib/ranks";
import { formatNumber } from "@/lib/utils";

export function MyProfileCard() {
  const { data: session } = useSession();

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
      (sum: number, p: { playerValue: number; ownedCount?: number }) =>
        sum + p.playerValue * (1 + (p.ownedCount ?? 0)),
      0
    ) ?? 0);
  const myOwnerCount = player?.ownerCount ?? 0;
  const portfolioValue = basePortfolio * Math.max(myOwnerCount, 1);

  return (
    <Card className="border-gray-800 bg-gradient-to-br from-gray-900/80 to-gray-950/80 overflow-hidden">
      <CardContent className="p-4 sm:p-6">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Coins className="h-3.5 w-3.5 text-t1-400" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">Credits</span>
            </div>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {formatNumber(credits ?? 0)}¢
            </span>
          </div>
          <div className="rounded-lg bg-gray-800/40 border border-gray-700/40 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Briefcase className="h-3.5 w-3.5 text-purple-400" />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-400">Portfolio</span>
            </div>
            <span className="text-lg sm:text-xl font-bold font-mono text-white">
              {formatNumber(portfolioValue)}¢
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