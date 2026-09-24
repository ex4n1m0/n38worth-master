"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { toast } from "@/lib/event-feed";
import { formatCompact } from "@/lib/utils";
import { useSound } from "@/hooks/useSound";
import { CoachMark } from "@/components/CoachMark";
import { useLanguage } from "@/components/LanguageContext";
import type { Locale, TranslationKeys } from "@/lib/i18n";
import { cardDisplayName } from "@/lib/display-names";
import {
  MISSIONS,
  FINAL_MISSION_INDEX,
  UNLOCK_GAME_MISSION_INDEX,
  missionLabel,
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
function unlockDescription(index: number, t: TranslationKeys, locale: Locale): string {
  const mission = MISSIONS[index];
  if (!mission) return "";
  const parts: string[] = [t.missionUnlockFreeNpc];
  if (mission.addHireSlots) {
    parts.push(t.missionUnlockHireSlots.replace("{count}", String(mission.addHireSlots)));
  }
  if (index === UNLOCK_GAME_MISSION_INDEX) {
    parts.push(t.missionUnlockGame);
  } else if (mission.rewardCards.length > 0) {
    parts.push(
      t.missionUnlockCards.replace(
        "{cards}",
        mission.rewardCards.map((card) => cardDisplayName(card, locale)).join(", ")
      )
    );
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
  const { t, locale } = useLanguage();
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
        const description = unlockDescription(i, t, locale);
        toast.success(t.missionCompleteToast, {
          description: description || undefined,
          duration: 8000,
        });
      }
      prevLevelRef.current = data.missionLevel;
    }
  }, [data, play, t, locale]);

  if (isPending) {
    return (
      <div className="flex items-center gap-2 animate-pulse">
        <div className="h-4 w-8 rounded bg-gray-800/80 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="h-3 w-1/3 rounded bg-gray-800/80" />
          <div className="h-1.5 w-full rounded-full bg-gray-800/80" />
        </div>
      </div>
    );
  }

  if (!data || data.allComplete || !data.current) return null;

  const { current, totalMissions } = data;
  const pct = current.threshold > 0
    ? Math.min(100, Math.round((current.progress / current.threshold) * 100))
    : 0;

  // Locale-aware label for the CURRENT mission (dynamic threshold for the final).
  const currentLabel =
    current.index === FINAL_MISSION_INDEX && data.finalGoddessThreshold
      ? finalGoddessLabel(data.finalGoddessThreshold, locale)
      : missionLabel(current.index, locale);

  // Preview of the mission after the current one (dynamic label for the final).
  const nextIndex = current.index + 1;
  const nextMission = MISSIONS[nextIndex];
  const nextLabel = nextMission
    ? nextIndex === FINAL_MISSION_INDEX && data.finalGoddessThreshold
      ? finalGoddessLabel(data.finalGoddessThreshold, locale)
      : missionLabel(nextIndex, locale)
    : null;

  return (
    <div title={t.missionWinConditionHint}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <Trophy className="h-3.5 w-3.5 text-t1-400 shrink-0" />
          <span className="text-[11px] font-bold text-t1-300 whitespace-nowrap tabular-nums">
            {current.index + 1}/{totalMissions}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="text-xs font-semibold text-white leading-tight truncate">
              {currentLabel}
            </p>
            <span className="text-[11px] font-bold text-t1-200 shrink-0 tabular-nums">
              {formatCompact(current.progress)} / {formatCompact(current.threshold)}
            </span>
          </div>
          <div className="relative w-full overflow-hidden rounded-full border border-amber-500/20 bg-gray-800/80 h-1.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 shadow-[0_0_10px_rgba(245,158,11,0.6)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
      {nextLabel && (
        <p className="text-[10px] text-gray-500 truncate mt-0.5">
          {t.missionNextLabel.replace("{label}", nextLabel)}
        </p>
      )}
      <CoachMark id="mission-bar" className="mt-1 max-w-lg">
        {t.missionCoachMark}
      </CoachMark>
    </div>
  );
}
