"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useMemo } from "react";

interface OwnedPlayer {
  id: number;
  username: string;
}

interface PlayerResponse {
  ownedPlayers?: OwnedPlayer[];
}

/**
 * Returns a Set of player IDs that the currently signed-in user has hired.
 * Used to decide whether to display real avatars or the masked UNHIRED2.png.
 */
export function useOwnedPlayerIds() {
  const { data: session } = useSession();
  const username = session?.user?.name;

  const query = useQuery<PlayerResponse>({
    queryKey: ["owned-player-ids", username],
    queryFn: async () => {
      const res = await fetch(`/api/players/${username}?lite=1`);
      if (!res.ok) throw new Error("Failed to fetch owned players");
      return res.json();
    },
    enabled: !!username,
    staleTime: 30 * 1000,
  });

  const ownedIds = useMemo(() => {
    const set = new Set<number>();
    query.data?.ownedPlayers?.forEach((p) => set.add(p.id));
    return set;
  }, [query.data]);

  const ownedUsernames = useMemo(() => {
    const set = new Set<string>();
    query.data?.ownedPlayers?.forEach((p) => set.add(p.username));
    return set;
  }, [query.data]);

  return {
    ownedIds,
    ownedUsernames,
    isOwned: (id: number) => ownedIds.has(id),
    isOwnedByUsername: (username: string) => ownedUsernames.has(username),
    isLoading: query.isLoading,
  };
}
