"use client";

import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, DollarSign } from "lucide-react";
import { formatCompact } from "@/lib/utils";
import { useNow } from "@/hooks/useNow";
import { secondsToNextHour, formatCountdown } from "@/components/HourlyRewardCountdown";
import { useLanguage } from "@/components/LanguageContext";

export function PortfolioRewardCountdown() {
  const { data: session } = useSession();
  const { t } = useLanguage();

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
  const portfolioValue: number = playerData?.portfolioValue ?? 0;
  const potentialReward: number = playerData?.portfolioReward ?? 0;

  // Live countdown to the next hourly payout (cron fires at :00 UTC).
  const now = useNow();
  const secondsToPayout = secondsToNextHour(now);

  return (
    <div className="rounded-xl border border-gray-800 p-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-t1-400" />
        <h3 className="text-sm font-semibold text-t1-400">
          {t.portfolioRewardTitle}
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
                  {t.portfolioYourValue.replace("{value}", formatCompact(portfolioValue))}¢
                </span>
              ) : (
                <span className="text-sm font-semibold text-t1-300 truncate">
                  {t.portfolioEmpty}
                </span>
              )}
            </div>
            {portfolioValue > 0 && (
              <span className="text-sm font-bold text-t1-400 shrink-0">
                +{formatCompact(potentialReward)}¢
              </span>
            )}
          </div>
          {portfolioValue > 0 && (
            <div className="mt-1 text-right text-[11px] text-t1-400/80 font-mono">
              {t.paysIn.replace("{time}", formatCountdown(secondsToPayout))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500 mt-2">
        {t.portfolioRewardNote}
      </p>
    </div>
  );
}
