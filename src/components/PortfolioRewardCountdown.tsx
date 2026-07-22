"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, DollarSign, ChevronDown, ChevronUp, Users, Info } from "lucide-react";
import { formatCompact } from "@/lib/utils";

export function PortfolioRewardCountdown() {
  const { data: session } = useSession();

  // Fetch current user's portfolio data from /api/me — this uses the same
  // BigInt-safe formula as the portfolio-reward cron and leaderboard rankings,
  // computed server-side over ALL owned players (not paginated).
  const { data: playerData } = useQuery({
    queryKey: ["me", "portfolio"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch player");
      return res.json();
    },
    enabled: !!session?.user?.name,
    staleTime: 30 * 1000,
    refetchInterval: 300 * 1000,
  });

  // portfolioValue and portfolioReward are computed server-side in /api/me
  // using the same BigInt-safe formula as the cron and leaderboard — no client recompute needed.
  const playerValue = playerData?.playerValue ?? 0;
  const portfolioValue: number = playerData?.portfolioValue ?? 0;
  const potentialReward: number = playerData?.portfolioReward ?? 0;
  
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-t1-400" />
        <h3 className="text-sm font-semibold text-t1-400">
          Portfolio Reward
        </h3>
      </div>
      
      {/* Show user's portfolio value and potential reward */}
      {session?.user?.name && (
        <div className="mt-3 p-2 rounded-lg bg-t1-500/10 border border-t1-500/20 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <DollarSign className="h-4 w-4 text-t1-400 shrink-0" />
              {portfolioValue > 0 ? (
                <span className="text-sm font-semibold text-t1-300 truncate">
                  Your Portfolio: {formatCompact(portfolioValue)}¢
                </span>
              ) : (
                <span className="text-sm font-semibold text-t1-300 truncate">
                  Your Portfolio: 0¢ — Hire players to earn!
                </span>
              )}
            </div>
            {portfolioValue > 0 && (
              <span className="text-sm font-bold text-t1-400 shrink-0">
                +{formatCompact(potentialReward)}¢
              </span>
            )}
          </div>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-2">
        Earn 0.2% of your portfolio value as credits.
      </p>
      
      {/* Breakdown Toggle */}
      {session?.user?.name && portfolioValue > 0 && (
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="mt-3 flex items-center gap-1 text-xs text-t1-400 hover:text-t1-300 transition-colors"
        >
          <Info className="h-3 w-3" />
          {showBreakdown ? "Hide" : "Show"} Calculation Breakdown
          {showBreakdown ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>
      )}

      {/* Breakdown Section */}
      {showBreakdown && session?.user?.name && (
        <div className="mt-3 p-3 rounded-lg bg-gray-900/60 border border-gray-700/50 space-y-3">
          <h4 className="text-xs font-semibold text-gray-300 flex items-center gap-1">
            <Users className="h-3 w-3" />
            Portfolio Calculation Breakdown
          </h4>

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Your Base Value</span>
            <span className="text-white font-medium">{formatCompact(playerValue)}¢</span>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-700">
            <span className="text-gray-300 font-medium">Final Portfolio Value</span>
            <span className="text-white font-bold">{formatCompact(portfolioValue)}¢</span>
          </div>

          <div className="flex items-center justify-between text-xs bg-t1-500/10 rounded px-2 py-1">
            <span className="text-t1-300">0.2% Reward</span>
            <span className="text-t1-400 font-bold">+{formatCompact(potentialReward)}¢</span>
          </div>
        </div>
      )}
    </div>
  );
}
