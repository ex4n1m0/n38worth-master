"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Clock, TrendingUp, DollarSign, ChevronDown, ChevronUp, Users, Info } from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { getDynamicFontSize } from "@/lib/utils";

/** Calculate seconds remaining until the next portfolio reward interval */
function getSecondsToNextPortfolioReward(intervalMinutes: number) {
  const now = new Date();
  const minutesSinceEpoch = Math.floor(now.getTime() / (1000 * 60));
  const minutesUntilNext = intervalMinutes - (minutesSinceEpoch % intervalMinutes);
  const seconds = now.getSeconds();
  
  // Calculate total seconds until next interval boundary
  return (minutesUntilNext * 60) - seconds;
}

export function PortfolioRewardCountdown() {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const intervalMinutes = 2; // Fixed 2-minute interval
  const prevSecondsRef = useRef<number>(0);
  const wasSmallRef = useRef<boolean>(false);
  const { data: session } = useSession();
  const { play } = useSound();

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
    refetchInterval: 60 * 1000,
  });

  useEffect(() => {
    const update = () => {
      const newSeconds = getSecondsToNextPortfolioReward(intervalMinutes);
      const prevSeconds = prevSecondsRef.current;
      
      // Check if we just had a reset: was counting down (prev was small, 1-60) and now jumped to large
      const justReset = wasSmallRef.current && prevSeconds <= 60 && newSeconds > 100;
      
      if (justReset) {
        play("hire");
      }
      
      // Track if we're in the "counting down from small value" state
      wasSmallRef.current = prevSeconds > 0 && prevSeconds <= 60;
      
      prevSecondsRef.current = newSeconds;
      setTotalSeconds(newSeconds);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [intervalMinutes, play]);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");

  // portfolioValue and portfolioReward are computed server-side in /api/me
  // using the same BigInt-safe formula as the cron and leaderboard — no client recompute needed.
  const playerValue = playerData?.playerValue ?? 0;
  const portfolioValue: number = playerData?.portfolioValue ?? 0;
  const potentialReward: number = playerData?.portfolioReward ?? 0;
  
  const [showBreakdown, setShowBreakdown] = useState(false);

  return (
    <div className="rounded-xl bg-gradient-to-br from-t1-900/20 to-t2-900/20 border border-t1-500/20 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-t1-400" />
          <h3 className="text-sm font-semibold text-t1-400">
            Portfolio Reward — Every {intervalMinutes} Min
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-t1-500/20">
          <Clock className="h-3.5 w-3.5 text-t1-400" />
          <span className="font-mono font-bold text-white text-sm">
            {pad(minutes)}:{pad(seconds)}
          </span>
        </div>
      </div>
      
      {/* Show user's portfolio value and potential reward */}
      {session?.user?.name && (
        <div className="mt-3 p-2 rounded-lg bg-t1-500/10 border border-t1-500/20 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <DollarSign className="h-4 w-4 text-t1-400 shrink-0" />
              {portfolioValue > 0 ? (
                <span className={`${getDynamicFontSize(portfolioValue)} font-semibold text-t1-300 truncate`}>
                  Your Portfolio: {portfolioValue.toLocaleString()}¢
                </span>
              ) : (
                <span className="text-sm font-semibold text-t1-300 truncate">
                  Your Portfolio: 0¢ — Hire players to earn!
                </span>
              )}
            </div>
            {portfolioValue > 0 && (
              <span className={`${getDynamicFontSize(potentialReward)} font-bold text-t1-400 shrink-0`}>
                +{potentialReward.toLocaleString()}¢
              </span>
            )}
          </div>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-2">
        Earn 0.2% of your portfolio value as credits every {intervalMinutes} minutes!
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
            <span className="text-white font-medium">{playerValue.toLocaleString()}¢</span>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-700">
            <span className="text-gray-300 font-medium">Final Portfolio Value</span>
            <span className="text-white font-bold">{portfolioValue.toLocaleString()}¢</span>
          </div>

          <div className="flex items-center justify-between text-xs bg-t1-500/10 rounded px-2 py-1">
            <span className="text-t1-300">0.2% Reward</span>
            <span className="text-t1-400 font-bold">+{potentialReward.toLocaleString()}¢</span>
          </div>
        </div>
      )}
    </div>
  );
}
