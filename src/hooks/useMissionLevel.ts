"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

interface MissionData {
  missionLevel: number;
  ownedCount: number;
  totalMissions: number;
  allComplete: boolean;
}

/**
 * Returns the current user's mission level, used by market cards to decide
 * which goddess/bonus cards are unlocked for purchase. Shares the `["missions"]`
 * query cache with `MissionProgress` so it adds no extra requests.
 */
export function useMissionLevel(): number {
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
    refetchInterval: 300 * 1000,
  });
  return data?.missionLevel ?? 0;
}
