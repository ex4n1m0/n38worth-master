"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

interface GoddessPowers {
  hasWealth: boolean;
  hasKnowledge: boolean;
  hasFate: boolean;
  hasTime: boolean;
  hasWar: boolean;
  hasAll: boolean;
  temporaryKnowledgeUntil: string | null;
  /** ISO timestamp while War Delete is on its 1-minute cooldown, else null. */
  warDeleteCooldownUntil: string | null;
}

/**
 * Hook to check if the current user has the Goddess of Knowledge power.
 * Returns true if user has Knowledge or the Goddess card (which grants all powers).
 */
export function useKnowledgePower() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const { data: powers, isLoading } = useQuery<GoddessPowers>({
    queryKey: ["goddess-powers", userId],
    queryFn: async () => {
      const res = await fetch("/api/game/goddess-powers");
      if (!res.ok) throw new Error("Failed to fetch goddess powers");
      return res.json();
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });

  return {
    hasKnowledge: powers?.hasKnowledge ?? false,
    hasWar: powers?.hasWar ?? false,
    hasFate: powers?.hasFate ?? false,
    warDeleteCooldownUntil: powers?.warDeleteCooldownUntil ?? null,
    isLoading,
  };
}
