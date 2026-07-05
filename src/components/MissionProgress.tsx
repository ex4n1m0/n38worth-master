"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { formatCompact } from "@/lib/utils";

interface MissionData {
  missionLevel: number;
  ownedCount: number;
  totalMissions: number;
  allComplete: boolean;
  current: {
    index: number;
    threshold: number;
    label: string;
    progress: number;
  } | null;
}

/**
 * Sequential marketplace mission tracker. Shows a single progress bar for the
 * player's current "collect N cards" mission; the next mission appears here
 * once the current one is completed. Renders nothing when all missions are done.
 */
export function MissionProgress() {
  const { data } = useQuery<MissionData>({
    queryKey: ["missions"],
    queryFn: async () => {
      const res = await fetch("/api/missions");
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });

  if (!data || data.allComplete || !data.current) return null;

  const { current, totalMissions } = data;
  const pct = current.threshold > 0
    ? Math.min(100, Math.round((current.progress / current.threshold) * 100))
    : 0;

  return (
    <div className="rounded-xl border border-t1-500/40 bg-gradient-to-r from-t1-900/40 via-t1-900/20 to-t1-900/40 p-4 shadow-[0_0_18px_rgba(34,211,238,0.2)]">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="h-5 w-5 text-t1-400 shrink-0" />
          <p className="text-sm sm:text-base font-bold text-t1-100 truncate">
            {current.label}
          </p>
        </div>
        <span className="text-xs font-semibold text-t1-300 shrink-0 whitespace-nowrap">
          Mission {current.index + 1}/{totalMissions}
        </span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full border border-t1-500/20 bg-gray-800/80">
        <div
          className="h-full rounded-full bg-gradient-to-r from-t1-500 to-t1-300 shadow-[0_0_10px_rgba(34,211,238,0.6)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-white drop-shadow">
          {formatCompact(current.progress)} / {formatCompact(current.threshold)} cards
        </span>
      </div>
    </div>
  );
}
