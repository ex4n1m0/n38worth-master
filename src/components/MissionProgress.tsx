"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { formatCompact } from "@/lib/utils";
import { useSound } from "@/hooks/useSound";
import { CoachMark } from "@/components/CoachMark";
import {
  MISSIONS,
  FINAL_MISSION_INDEX,
  UNLOCK_GAME_MISSION_INDEX,
  finalGoddessLabel,
} from "@/lib/missions-data";

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
  finalGoddessThreshold?: number;
}

/** Human-readable summary of what completing mission `index` unlocks. */
function unlockDescription(index: number): string {
  const mission = MISSIONS[index];
  if (!mission) return "";
  const parts: string[] = ["+1 free NPC added to your squad"];
  if (mission.addHireSlots) parts.push(`+${mission.addHireSlots} hire slots`);
  if (index === UNLOCK_GAME_MISSION_INDEX) {
    parts.push("Ranks, professions & combos unlocked!");
  } else if (mission.rewardCards.length > 0) {
    parts.push(`${mission.rewardCards.join(", ")} unlocked!`);
  }
  return parts.join(" · ");
}

/**
 * Sequential marketplace mission tracker. Shows a single progress bar for the
 * player's current "collect N cards" mission; the next mission appears here
 * once the current one is completed. Renders nothing when all missions are done.
 *
 * Also celebrates mission completion (sound + toast describing what unlocked)
 * and previews the NEXT mission under the bar so players always know what
 * they're working toward.
 */
export function MissionProgress() {
  const { play } = useSound();
  const { data, isPending } = useQuery<MissionData>({
    queryKey: ["missions"],
    queryFn: async () => {
      const res = await fetch("/api/missions");
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
    staleTime: 15 * 1000,
    // Slow fallback poll — ownership-changed events invalidate ["missions"].
    refetchInterval: 300 * 1000,
  });

  // Celebrate mission completion: when missionLevel increases, fire the win
  // sound and a toast describing what just unlocked. The ref seeds on first
  // data so page load doesn't trigger it.
  const prevLevelRef = useRef<number | null>(null);
  useEffect(() => {
    if (!data) return;
    if (prevLevelRef.current === null) {
      prevLevelRef.current = data.missionLevel;
      return;
    }
    if (data.missionLevel > prevLevelRef.current) {
      play("win");
      for (let i = prevLevelRef.current; i < data.missionLevel; i++) {
        const description = unlockDescription(i);
        toast.success("🎉 Mission complete!", {
          description: description || undefined,
          duration: 8000,
        });
      }
      prevLevelRef.current = data.missionLevel;
    }
  }, [data, play]);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 sm:gap-3 animate-pulse">
        <div className="h-6 w-10 rounded bg-gray-800/80 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-1/3 rounded bg-gray-800/80" />
          <div className="h-2.5 w-full rounded-full bg-gray-800/80" />
        </div>
      </div>
    );
  }

  if (!data || data.allComplete || !data.current) return null;

  const { current, totalMissions } = data;
  const pct = current.threshold > 0
    ? Math.min(100, Math.round((current.progress / current.threshold) * 100))
    : 0;

  // Preview of the mission after the current one (dynamic label for the final).
  const nextIndex = current.index + 1;
  const nextMission = MISSIONS[nextIndex];
  const nextLabel = nextMission
    ? nextIndex === FINAL_MISSION_INDEX && data.finalGoddessThreshold
      ? finalGoddessLabel(data.finalGoddessThreshold)
      : nextMission.label
    : null;

  return (
    <div title="Win the game: unlock all Six and hold them for 60 minutes">
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
              className="font-bold text-white leading-tight"
              style={{ fontSize: "clamp(0.85rem, 3.2vw, 2.5rem)" }}
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
      {nextLabel && (
        <p className="text-gray-500 truncate mt-0.5" style={{ fontSize: "clamp(0.55rem, 1.1vw, 0.8rem)" }}>
          Next: {nextLabel}
        </p>
      )}
      <CoachMark id="mission-bar" className="mt-1 max-w-lg">
        This bar tracks your current mission. Complete it to unlock new
        features — ranks, profession combos, Botnet, and the Six.
      </CoachMark>
    </div>
  );
}
