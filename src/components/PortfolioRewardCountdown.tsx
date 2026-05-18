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

  // Fetch current user's portfolio data
  const { data: playerData } = useQuery({
    queryKey: ["player", "me"],
    queryFn: async () => {
      const res = await fetch(`/api/players/${session?.user?.name}`);
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

  // Calculate portfolio value and potential reward
  // Count ALL owned players, multiply each by (1 + number of players they own)
  const playerValue = playerData?.playerValue ?? 0;
  const ownedPlayers = playerData?.ownedPlayers ?? [];
  const ownedValue = ownedPlayers.reduce(
    (sum: number, p: { playerValue: number; ownedCount?: number }) => 
      sum + p.playerValue * (1 + (p.ownedCount ?? 0)),
    0
  );
  const basePortfolio = playerValue + ownedValue;
  const ownerCount = playerData?.ownerCount ?? 0;
  const portfolioValue = basePortfolio * Math.max(ownerCount, 1);
  const potentialReward = Math.floor(portfolioValue * 0.002);
  
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
      {session?.user?.name && portfolioValue > 0 && (
        <div className="mt-3 p-2 rounded-lg bg-t1-500/10 border border-t1-500/20 overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <DollarSign className="h-4 w-4 text-t1-400 shrink-0" />
              <span className={`${getDynamicFontSize(portfolioValue)} font-semibold text-t1-300 truncate`}>
                Your Portfolio: {portfolioValue.toLocaleString()}¢
              </span>
            </div>
            <span className={`${getDynamicFontSize(potentialReward)} font-bold text-t1-400 shrink-0`}>
              +{potentialReward.toLocaleString()}¢
            </span>
          </div>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-2">
        Earn 0.2% of your portfolio value as credits every {intervalMinutes} minutes!
      </p>
      
      {/* Breakdown Toggle */}
      {session?.user?.name && ownedPlayers.length > 0 && (
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
          
          {/* Your Value */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">Your Base Value</span>
            <span className="text-white font-medium">{playerValue.toLocaleString()}¢</span>
          </div>
          
          {/* Owned Players Breakdown */}
          {ownedPlayers.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Owned Players:</p>
              {[...ownedPlayers].sort((a: { playerValue: number; ownedCount?: number }, b: { playerValue: number; ownedCount?: number }) => {
                const ca = a.playerValue * (1 + (a.ownedCount ?? 0));
                const cb = b.playerValue * (1 + (b.ownedCount ?? 0));
                return cb - ca;
              }).map((player: { username?: string; playerValue: number; ownedCount?: number }, index: number) => {
                const multiplier = 1 + (player.ownedCount ?? 0);
                const contribution = player.playerValue * multiplier;
                return (
                  <div key={index} className="flex items-center justify-between text-xs pl-2 border-l-2 border-gray-700">
                    <div className="flex flex-col">
                      <span className="text-gray-300">{player.username || `Player ${index + 1}`}</span>
                      <span className="text-gray-500">
                        {player.playerValue.toLocaleString()}¢ × {multiplier}x
                      </span>
                    </div>
                    <span className="text-t1-400 font-medium">{contribution.toLocaleString()}¢</span>
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Subtotal */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-700">
            <span className="text-gray-400">Base Portfolio (You + Owned)</span>
            <span className="text-white font-medium">{basePortfolio.toLocaleString()}¢</span>
          </div>
          
          {/* Owner Multiplier */}
          {ownerCount > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Owner Multiplier</span>
              <span className="text-amber-400 font-medium">×{ownerCount}</span>
            </div>
          )}
          
          {/* Final Portfolio */}
          <div className="flex items-center justify-between text-xs pt-2 border-t border-gray-700">
            <span className="text-gray-300 font-medium">Final Portfolio Value</span>
            <span className="text-white font-bold">{portfolioValue.toLocaleString()}¢</span>
          </div>
          
          {/* Reward Calculation */}
          <div className="flex items-center justify-between text-xs bg-t1-500/10 rounded px-2 py-1">
            <span className="text-t1-300">0.2% Reward</span>
            <span className="text-t1-400 font-bold">+{potentialReward.toLocaleString()}¢</span>
          </div>
        </div>
      )}
    </div>
  );
}
