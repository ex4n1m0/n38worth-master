"use client";

import { useState, useEffect } from "react";
import { Users, Coins, User, Circle } from "lucide-react";
import { useLanguage } from "./LanguageContext";
import { formatCompact, formatNumber } from "@/lib/utils";

export function GlobalInfoBar() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<{
    totalPlayers: number;
    totalEconomy: number;
    totalNpcs: number;
    totalHumans: number;
    onlineHumans?: number;
  } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      if (document.visibilityState !== "visible") return; // no polling from background tabs
      try {
        const res = await fetch("/api/game/stats");
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // silently fail
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 300000); // refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  return (
    <div className="flex items-center gap-1.5 sm:gap-2.5 flex-wrap sm:ml-auto sm:justify-end text-sm sm:text-base font-bold">
      <div className="flex items-center gap-1.5">
        <Users className="h-4 w-4 sm:h-5 sm:w-5 text-t1-400 shrink-0" />
        <span className="text-gray-500">Avatars</span>
        <span className="text-white">
          {formatNumber(stats.totalPlayers)}
        </span>
      </div>
      <div className="hidden sm:block w-px h-3 bg-gray-700" />
      <div className="flex items-center gap-1.5">
        <Coins className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-400 shrink-0" />
        <span className="text-gray-500">{t.totalEconomy}</span>
        <span className="text-white">
          {formatCompact(stats.totalEconomy)}¢
        </span>
      </div>
      <div className="hidden sm:block w-px h-3 bg-gray-700" />
      <div className="flex items-center gap-1.5">
        <User className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 shrink-0" />
        <span className="text-gray-500">Humans</span>
        <span className="text-white">
          {formatCompact(stats.totalHumans)}
        </span>
        {stats.onlineHumans != null && (
          <span className="flex items-center gap-1 text-green-400">
            <Circle className="h-2 w-2 fill-green-400 text-green-400 shrink-0" />
            <span className="text-white">
              {formatCompact(stats.onlineHumans)}
            </span>
            <span>online</span>
          </span>
        )}
      </div>
    </div>
  );
}
