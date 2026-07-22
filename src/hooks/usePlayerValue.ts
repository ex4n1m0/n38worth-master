"use client";

import { useQuery } from "@tanstack/react-query";

export function usePlayerValue() {
  return useQuery({
    queryKey: ["player-value"],
    queryFn: async () => {
      const res = await fetch("/api/me");
      if (!res.ok) throw new Error("Failed to fetch player value");
      const data = await res.json();
      return typeof data.playerValue === "number" ? data.playerValue : Number(data.playerValue) || 0;
    },
    staleTime: 60 * 1000,
    refetchInterval: 300 * 1000,
  });
}
