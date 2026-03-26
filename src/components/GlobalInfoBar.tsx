"use client";

import { useState, useEffect } from "react";
import { Users, Coins } from "lucide-react";
import { useLanguage } from "./LanguageContext";

export function GlobalInfoBar() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<{
    totalPlayers: number;
    totalEconomy: number;
  } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
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
    const interval = setInterval(fetchStats, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (!stats) return null;

  return (
    <div className="w-full bg-gray-900/80 border-b border-gray-800/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-3 sm:gap-6 h-8 text-xs">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Users className="h-3 w-3 text-t1-400" />
          <span>
            <span className="font-semibold text-white">
              {stats.totalPlayers.toLocaleString()}
            </span>{" "}
            <span className="hidden sm:inline">{t.totalPlayers}</span>
          </span>
        </div>
        <div className="w-px h-3 bg-gray-700" />
        <div className="flex items-center gap-1.5 text-gray-400">
          <Coins className="h-3 w-3 text-yellow-400" />
          <span>
            <span className="hidden sm:inline">{t.totalEconomy} </span>
            <span className="font-semibold text-white">
              {stats.totalEconomy.toLocaleString()}¢
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}