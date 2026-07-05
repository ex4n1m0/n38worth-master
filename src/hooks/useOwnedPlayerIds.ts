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
 * Returns the set of player IDs / usernames the current viewer has hired.
 *
 * Note: this hook used to also pull a full owner-wide `avatarMap` from
 * `/api/players/:username/owned-avatars`, which silently failed for any user
 * with a large roster because avatars are stored as base64 data URIs (>10 MB
 * total quickly exceeds Neon/Vercel response caps). Avatars are now fetched
 * per visible page by the components that render them — keep this hook
 * lightweight so it can be called everywhere without cost.
 */
export function useOwnedPlayerIds() {
  const { data: session } = useSession();
  const username = session?.user?.name;

  const query = useQuery<PlayerResponse>({
    queryKey: ["owned-player-ids", username],
    queryFn: async () => {
      // Dedicated ids-only endpoint: returns EVERY owned player with no page
      // cap. The old `/api/players/:username?lite=1&limit=999` approach missed
      // cards beyond the first 999, so owned cards wrongly showed GET buttons.
      const res = await fetch(`/api/me/owned-ids`);
      if (!res.ok) throw new Error("Failed to fetch owned players");
      return res.json();
    },
    enabled: !!username,
    staleTime: 30 * 1000,
    refetchInterval: 45 * 1000,
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
    // True once a fetch has succeeded — callers can use this to avoid acting on
    // an empty `ownedIds` during the initial load (which would otherwise look
    // like "owns nothing").
    isSuccess: query.isSuccess,
  };
}
