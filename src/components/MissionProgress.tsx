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
    refetchInterval: 150 * 1000,
  });

  if (!data || data.allComplete || !data.current) return null;

  const { current, totalMissions } = data;
  const pct = current.threshold > 0
    ? Math.min(100, Math.round((current.progress / current.threshold) * 100))
    : 0;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-1.5 shrink-0">
        <Trophy
          className="text-t1-400 shrink-0"
          style={{ width: "clamp(1rem, 2.2vw, 2rem)", height: "clamp(1rem, 2.2vw, 2rem)" }}
        />
        <span
          className="font-bold text-t1-300 whitespace-nowrap tabular-nums"
          style={{ fontSize: "clamp(0.7rem, 1.6vw, 1.25rem)" }}
        >
          {current.index + 1}/{totalMissions}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p
            className="font-bold truncate text-white"
            style={{ fontSize: "clamp(1.1rem, 3.2vw, 2.5rem)" }}
          >
            {current.label}
          </p>
          <span
            className="font-bold text-t1-200 shrink-0 tabular-nums"
            style={{ fontSize: "clamp(0.62rem, 1.3vw, 1.1rem)" }}
          >
            {formatCompact(current.progress)} / {formatCompact(current.threshold)}
          </span>
        </div>
        <div
          className="relative w-full overflow-hidden rounded-full border border-amber-500/20 bg-gray-800/80"
          style={{ height: "clamp(0.375rem, 1.2vw, 0.9rem)" }}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 shadow-[0_0_10px_rgba(245,158,11,0.6)] transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
