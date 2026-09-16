"use client";

import { useQuery } from "@tanstack/react-query";
import { Terminal, TrendingUp, Clock, Users } from "lucide-react";
import { formatCompact } from "@/lib/utils";

interface BossIncomeEstimate {
  estimatedPerHour: number;
  portfolioTaxPerHour: number;
  hourlyTaxPerHour: number;
  ownedPlayerCount: number;
}

interface BossIncomeCardProps {
  userId: number;
}

export function BossIncomeCard({ userId }: BossIncomeCardProps) {
  const { data, isLoading } = useQuery<BossIncomeEstimate>({
    queryKey: ["boss-income-estimate", userId],
    queryFn: async () => {
      const res = await fetch("/api/me/boss-income-estimate");
      if (!res.ok) throw new Error("Failed to fetch boss income estimate");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
    refetchInterval: 300 * 1000,
  });

  const hasIncome = data && data.estimatedPerHour > 0;

  return (
    <div className="rounded-xl border border-gray-800 p-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Terminal className="h-5 w-5 text-amber-400" />
        <h3 className="text-sm font-semibold text-amber-400">
          Boss Income
        </h3>
      </div>

      {/* Main amount display */}
      <div className="mt-3">
        {isLoading ? (
          <div className="h-8 bg-white/5 rounded animate-pulse" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${hasIncome ? "text-amber-400" : "text-gray-500"}`}>
              ~{formatCompact(data?.estimatedPerHour ?? 0)}¢
            </span>
            <span className="text-xs text-gray-500">/ hour</span>
          </div>
        )}
      </div>

      {/* Breakdown */}
      {!isLoading && hasIncome && (
        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
          {/* Portfolio tax */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
              <span className="text-gray-400">Portfolio Tax (10%)</span>
            </div>
            <span className="text-emerald-400 font-medium">
              ~{formatCompact(data?.portfolioTaxPerHour ?? 0)}¢/h
            </span>
          </div>

          {/* Hourly tax */}
          {(data?.hourlyTaxPerHour ?? 0) > 0 && (
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3 w-3 text-orange-400" />
                <span className="text-gray-400">Hourly Tax (1%)</span>
              </div>
              <span className="text-orange-400 font-medium">
                ~{formatCompact(data?.hourlyTaxPerHour ?? 0)}¢/h
              </span>
            </div>
          )}

          {/* Owned player count */}
          {data && data.ownedPlayerCount > 0 && (
            <div className="flex items-center justify-between text-xs pt-2 border-t border-white/5">
              <div className="flex items-center gap-1.5">
                <Users className="h-3 w-3 text-gray-500" />
                <span className="text-gray-500">From {data.ownedPlayerCount} player{data.ownedPlayerCount !== 1 ? "s" : ""}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !hasIncome && (
        <p className="mt-2 text-xs text-gray-500">
          Hire players to start earning boss tax income!
        </p>
      )}
    </div>
  );
}
