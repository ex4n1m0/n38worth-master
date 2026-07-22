"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Medal } from "lucide-react";
import { formatCompact } from "@/lib/utils";

export function RankBonusCountdown() {
  const { data: session } = useSession();

  // Fetch current user's rank positions
  const { data: rankPositions } = useQuery({
    queryKey: ["rankPositions"],
    queryFn: async () => {
      const res = await fetch("/api/leaderboard");
      if (!res.ok) throw new Error("Failed to fetch rank positions");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
  });

  // Fetch current user's portfolio reward
  const { data: userData } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch user data");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
  });

  // Base prize amounts by position
  const basePrizeAmounts = [3, 2, 1];
  const positionEmojis = ["🥇", "🥈", "🥉"];

  // Calculate portfolio reward multiplier
  const portfolioReward = userData?.portfolioReward ?? 0;
  const multiplier = 0.02 * portfolioReward;

  // Calculate dynamic prize amounts
  const prizeAmounts = basePrizeAmounts.map(base => 
    Math.floor(base * Math.max(multiplier, 1))
  );

  // Get user's current positions and potential prizes
  const userPositions = rankPositions?.userPositions || {};
  const categories = ["empire", "credits", "value", "portfolio"];
  const categoryLabels: Record<string, string> = {
    empire: "Empire",
    credits: "Credits",
    value: "Value",
    portfolio: "Portfolio"
  };

  // Find all positions where user is in top 3
  const qualifyingPositions: { category: string; position: number; prize: number }[] = [];
  let totalPrize = 0;

  for (const category of categories) {
    const pos = userPositions[category];
    if (pos && pos <= 3) {
      const prize = prizeAmounts[pos - 1];
      qualifyingPositions.push({ category, position: pos, prize });
      totalPrize += prize;
    }
  }

  return (
    <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-3">
      <div className="flex items-center gap-2">
        <Trophy className="h-5 w-5 text-t2-400" />
        <h3 className="text-sm font-semibold text-t2-400">
          Rank Bonus
        </h3>
      </div>
      
      {/* Show user's current positions and potential prizes */}
      {session?.user?.name && qualifyingPositions.length > 0 && (
        <div className="mt-3 p-2 rounded-lg bg-t2-500/10 border border-t2-500/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Medal className="h-4 w-4 text-t2-400" />
              <span className="text-xs font-semibold text-t2-300">
                Your Positions:
              </span>
            </div>
            <span className="text-xs font-bold text-t2-400">
              +{formatCompact(totalPrize)}¢ total
            </span>
          </div>
          <div className="space-y-1">
            {qualifyingPositions.map(({ category, position, prize }) => (
              <div key={category} className="flex items-center justify-between text-xs">
                <span className="text-t2-200">
                  {positionEmojis[position - 1]} #{position} in {categoryLabels[category]}
                </span>
                <span className="text-t2-400 font-semibold">
                  +{formatCompact(prize)}¢
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-2">
        🥇3x  🥈2x  🥉  1x  (2% of Portfolio) Rewards:
      </p>
    </div>
  );
}
