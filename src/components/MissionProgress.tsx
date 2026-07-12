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
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <Trophy className="h-8 w-8 text-t1-400 shrink-0" />
        <span className="text-base sm:text-lg font-bold text-t1-300 whitespace-nowrap">
          {current.index + 1}/{totalMissions}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-base sm:text-xl font-bold text-t1-100 truncate">
            {current.label}
          </p>
          <span className="text-sm sm:text-base font-bold text-t1-200 shrink-0 tabular-nums">
            {formatCompact(current.progress)} / {formatCompact(current.threshold)}
          </span>
        </div>
        <div className="relative h-4 w-full overflow-hidden rounded-full border border-t1-500/20 bg-gray-800/80">
          <div
            className="h-full rounded-full bg-gradient-to-r from-t1-500 to-t1-300 shadow-[0_0_10px_rgba(34,211,238,0.6)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
