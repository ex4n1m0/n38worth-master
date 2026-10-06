"use client";

import { useQuery } from "@tanstack/react-query";
import { useSessionCompat as useSession } from "@/lib/session-compat";

interface MissionData {
  missionLevel: number;
  ownedCount: number;
  totalMissions: number;
  allComplete: boolean;
  finalGoddessThreshold?: number;
}

function useMissionData() {
  const { data: session } = useSession();
  const { data } = useQuery<MissionData>({
    queryKey: ["missions"],
    queryFn: async () => {
      const res = await fetch("/api/missions");
      if (!res.ok) throw new Error("Failed to fetch missions");
      return res.json();
    },
    enabled: !!session,
    staleTime: 60 * 1000,
    // Slow fallback poll — ownership-changed events invalidate ["missions"].
    refetchInterval: 600 * 1000,
  });
  return data;
}

/**
 * Returns the current user's mission level, used by market cards to decide
 * which goddess/bonus cards are unlocked for purchase. Shares the `["missions"]`
 * query cache with `MissionProgress` so it adds no extra requests.
 */
export function useMissionLevel(): number {
  return useMissionData()?.missionLevel ?? 0;
}

/**
 * Effective owned-card threshold to unlock the final Goddess (dynamic: 5,000
 * base +1,000 per game won). Null until the missions API has responded.
 * Shares the `["missions"]` query cache — no extra requests.
 */
export function useFinalGoddessThreshold(): number | null {
  return useMissionData()?.finalGoddessThreshold ?? null;
}
