"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

/**
 * Returns `true` once it's confirmed that at least one player OTHER than the
 * current viewer owns at least one card. Returns `undefined` while loading so
 * callers can wait before settling a default filter state.
 *
 * Used by the market + leaderboard to default the "Others Owned" filter to ON
 * only when there are actually other owners in the world.
 */
export function useOthersOwnPlayers() {
  const { data: session } = useSession();
  const username = session?.user?.name;

  const query = useQuery<{ exists: boolean }>({
    queryKey: ["other-owners-exist", username],
    queryFn: async () => {
      const res = await fetch("/api/players/other-owners-exist");
      if (!res.ok) throw new Error("Failed to check other owners");
      return res.json();
    },
    enabled: !!username,
    staleTime: 60 * 1000,
    // Don't refetch often — this is a default-setter, not live data. The user's
    // manual filter clicks after mount are authoritative.
    refetchInterval: 5 * 60 * 1000,
  });

  return query.data?.exists;
}
