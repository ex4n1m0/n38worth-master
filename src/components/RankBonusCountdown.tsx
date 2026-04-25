"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { Clock, Trophy, Medal } from "lucide-react";
import { useSound } from "@/hooks/useSound";
import { useCredits } from "@/hooks/useCredits";

/** Calculate seconds remaining until the next rank bonus interval */
function getSecondsToNextRankBonus(intervalMinutes: number) {
  const now = new Date();
  const minutesSinceEpoch = Math.floor(now.getTime() / (1000 * 60));
  const minutesUntilNext = intervalMinutes - (minutesSinceEpoch % intervalMinutes);
  const seconds = now.getSeconds();
  
  // Calculate total seconds until next interval boundary
  return (minutesUntilNext * 60) - seconds;
}

export function RankBonusCountdown() {
  const [totalSeconds, setTotalSeconds] = useState(0);
  const intervalMinutes = 6; // Fixed 6-minute interval
  const prevSecondsRef = useRef<number>(0);
  const wasSmallRef = useRef<boolean>(false);
  const { data: session } = useSession();
  const { play } = useSound();

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
    refetchInterval: 60 * 1000,
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
    refetchInterval: 60 * 1000,
  });

  useEffect(() => {
    const update = () => {
      const newSeconds = getSecondsToNextRankBonus(intervalMinutes);
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
    <div className="rounded-xl bg-gradient-to-br from-t2-900/20 to-t1-900/20 border border-t2-500/20 p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-t2-400" />
          <h3 className="text-sm font-semibold text-t2-400">
            Rank Bonus — Every {intervalMinutes} Min
          </h3>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900/60 border border-t2-500/20">
          <Clock className="h-3.5 w-3.5 text-t2-400" />
          <span className="font-mono font-bold text-white text-sm">
            {pad(minutes)}:{pad(seconds)}
          </span>
        </div>
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
              +{totalPrize.toLocaleString()}¢ total
            </span>
          </div>
          <div className="space-y-1">
            {qualifyingPositions.map(({ category, position, prize }) => (
              <div key={category} className="flex items-center justify-between text-xs">
                <span className="text-t2-200">
                  {positionEmojis[position - 1]} #{position} in {categoryLabels[category]}
                </span>
                <span className="text-t2-400 font-semibold">
                  +{prize.toLocaleString()}¢
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
